package v1

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"magitrickle/api/utils"
	"magitrickle/constant"
)

const (
	// A private GitHub repo's Releases API returns HTTP 404 without a token.
	// This public JSON feed is intended to be published through GitHub Pages.
	githubLatestNeoRelease = "https://dm4web.github.io/magitrickle/latest.json"
	githubNeoReleaseBase   = "https://dm4web.github.io/magitrickle/"
)

type updateStatus struct {
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion,omitempty"`
	Available      bool   `json:"available"`
	ReleaseURL     string `json:"releaseUrl,omitempty"`
}

type releaseChecker struct {
	client   *http.Client
	endpoint string
}

func newReleaseChecker() *releaseChecker {
	return &releaseChecker{
		client:   &http.Client{Timeout: 8 * time.Second},
		endpoint: githubLatestNeoRelease,
	}
}

func (h *Handler) CheckUpdate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	status, err := h.updates.check(r.Context(), constant.Version)
	if err != nil {
		utils.WriteError(w, http.StatusBadGateway, "failed to check Neo update feed")
		return
	}
	utils.WriteJson(w, http.StatusOK, status)
}

func (c *releaseChecker) check(ctx context.Context, current string) (updateStatus, error) {
	status := updateStatus{CurrentVersion: current}
	installed, err := strconv.ParseUint(current, 10, 64)
	if err != nil {
		return status, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint, nil)
	if err != nil {
		return status, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("User-Agent", "MagiTrickle-Neo/"+current)
	resp, err := c.client.Do(req)
	if err != nil {
		return status, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return status, fmt.Errorf("Neo update feed returned HTTP %d", resp.StatusCode)
	}
	var release struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64*1024)).Decode(&release); err != nil {
		return status, err
	}
	latest, err := strconv.ParseUint(release.TagName, 10, 64)
	if err != nil {
		return status, fmt.Errorf("unexpected Neo release tag %q", release.TagName)
	}

	status.LatestVersion = release.TagName
	status.Available = latest > installed
	if status.Available {
		status.ReleaseURL = githubNeoReleaseBase
	}
	return status, nil
}
