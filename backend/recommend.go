package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
)

type gameFeedback struct {
	Name   string   `json:"name" validate:"required,max=500"`
	Genres []string `json:"genres" validate:"max=40,dive,max=100"`
	Reason string   `json:"reason" validate:"max=100"`
}

type explainRequest struct {
	UserProfile struct {
		LikedGenres    []namedRef     `json:"likedGenres" validate:"max=40,dive"`
		DislikedGenres []namedRef     `json:"dislikedGenres" validate:"max=40,dive"`
		LikedGames     []gameFeedback `json:"likedGames" validate:"max=50,dive"`
		DislikedGames  []gameFeedback `json:"dislikedGames" validate:"max=50,dive"`
		LikedCount     int            `json:"likedCount" validate:"gte=0"`
	} `json:"userProfile"`
	Candidate struct {
		Name         string   `json:"name" validate:"required,max=500"`
		Description  string   `json:"description" validate:"max=20000"`
		Genres       []string `json:"genres" validate:"max=40,dive,max=100"`
		Platforms    []string `json:"platforms" validate:"max=80,dive,max=100"`
		Rating       float64  `json:"rating" validate:"gte=0,lte=5"`
		RatingsCount int      `json:"ratingsCount" validate:"gte=0"`
		Metacritic   *int     `json:"metacritic" validate:"omitempty,gte=0,lte=100"`
		ReleaseYear  *int     `json:"releaseYear" validate:"omitempty,gte=1950,lte=2100"`
		Playtime     *int     `json:"playtime" validate:"omitempty,gte=0"`
	} `json:"candidate"`
}

type explainResponse struct {
	Explanation string `json:"explanation"`
	MatchScore  int    `json:"matchScore"`
}

type recommender struct {
	gatewayURL string
	gatewayKey string
	model      string
	client     *http.Client
}

// explain never fails the request: without a gateway, or on any gateway error, it returns an empty explanation.
func (r *recommender) explain(c fiber.Ctx) error {
	var req explainRequest
	if err := bindJSON(c, &req); err != nil {
		return err
	}
	if r.gatewayURL == "" || r.gatewayKey == "" {
		return c.JSON(explainResponse{})
	}
	out, err := r.callGateway(c, buildPrompt(req))
	if err != nil {
		log.Printf("ai gateway: %v", err)
		return c.JSON(explainResponse{})
	}
	return c.JSON(out)
}

func (r *recommender) callGateway(c fiber.Ctx, systemPrompt string) (explainResponse, error) {
	body, _ := json.Marshal(map[string]any{
		"model":       r.model,
		"temperature": 0.7,
		"max_tokens":  300,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": "Generate the recommendation explanation."},
		},
		"response_format": map[string]any{
			"type": "json_schema",
			"json_schema": map[string]any{
				"name":   "explanation",
				"strict": true,
				"schema": map[string]any{
					"type":                 "object",
					"additionalProperties": false,
					"required":             []string{"explanation", "matchScore"},
					"properties": map[string]any{
						"explanation": map[string]any{"type": "string"},
						"matchScore":  map[string]any{"type": "integer"},
					},
				},
			},
		},
	})
	httpReq, err := http.NewRequestWithContext(c.Context(), http.MethodPost,
		strings.TrimRight(r.gatewayURL, "/")+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return explainResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+r.gatewayKey)
	httpReq.Header.Set("Content-Type", "application/json")

	client := r.client
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second}
	}
	res, err := client.Do(httpReq)
	if err != nil {
		return explainResponse{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return explainResponse{}, fmt.Errorf("status %d", res.StatusCode)
	}
	var completion struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(res.Body).Decode(&completion); err != nil {
		return explainResponse{}, err
	}
	if len(completion.Choices) == 0 {
		return explainResponse{}, fmt.Errorf("no choices")
	}
	var out explainResponse
	if err := json.Unmarshal([]byte(completion.Choices[0].Message.Content), &out); err != nil {
		return explainResponse{}, fmt.Errorf("decode content: %w", err)
	}
	out.MatchScore = min(max(out.MatchScore, 0), 100)
	return out, nil
}

func joinOrNone(items []string) string {
	if len(items) == 0 {
		return "none"
	}
	return strings.Join(items, ", ")
}

func feedbackTitles(games []gameFeedback, withReason bool) string {
	var parts []string
	for _, g := range games[:min(len(games), 5)] {
		s := fmt.Sprintf("%q (%s)", g.Name, strings.Join(g.Genres, ", "))
		if withReason && g.Reason != "" {
			s += " - " + g.Reason
		}
		parts = append(parts, s)
	}
	if len(parts) == 0 {
		return "none"
	}
	return strings.Join(parts, "; ")
}

func buildPrompt(req explainRequest) string {
	p, cand := req.UserProfile, req.Candidate
	names := func(refs []namedRef) []string {
		out := make([]string, len(refs))
		for i, r := range refs {
			out[i] = r.Name
		}
		return out
	}
	description := cand.Description
	if r := []rune(description); len(r) > 1500 {
		description = string(r[:1500])
	}

	var b strings.Builder
	b.WriteString("You are a video game recommendation engine. Given a player's taste profile and a candidate game, " +
		"write a brief, engaging explanation in 2-3 sentences of why this candidate is a good match. " +
		"Also give a match score from 0 to 100.\n\nPlayer taste profile:\n")
	fmt.Fprintf(&b, "- Genres liked: %s\n", joinOrNone(names(p.LikedGenres)))
	fmt.Fprintf(&b, "- Genres disliked: %s\n", joinOrNone(names(p.DislikedGenres)))
	fmt.Fprintf(&b, "- Games liked: %s\n", feedbackTitles(p.LikedGames, false))
	fmt.Fprintf(&b, "- Games disliked: %s\n", feedbackTitles(p.DislikedGames, true))
	fmt.Fprintf(&b, "- Total liked: %d\n\nCandidate:\n", p.LikedCount)
	fmt.Fprintf(&b, "- Name: %s\n", cand.Name)
	fmt.Fprintf(&b, "- Genres: %s\n", joinOrNone(cand.Genres))
	fmt.Fprintf(&b, "- Platforms: %s\n", joinOrNone(cand.Platforms))
	fmt.Fprintf(&b, "- Rating: %.2f/5 (%d ratings)\n", cand.Rating, cand.RatingsCount)
	if cand.Metacritic != nil {
		fmt.Fprintf(&b, "- Metacritic: %d\n", *cand.Metacritic)
	}
	if cand.ReleaseYear != nil {
		fmt.Fprintf(&b, "- Year: %d\n", *cand.ReleaseYear)
	}
	if cand.Playtime != nil && *cand.Playtime > 0 {
		fmt.Fprintf(&b, "- Average playtime: %d hours\n", *cand.Playtime)
	}
	fmt.Fprintf(&b, "- Description: %s\n\nReply with valid JSON only.", description)
	return b.String()
}
