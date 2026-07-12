package response

import (
	"encoding/json"
	"net/http"
)

// APIResponse is the standard response format for all API endpoints.
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data"`
	Error   *APIError   `json:"error"`
}

// APIError represents a structured error in API responses.
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Success sends a successful JSON response.
func Success(w http.ResponseWriter, status int, data interface{}) {
	JSON(w, status, APIResponse{
		Success: true,
		Data:    data,
		Error:   nil,
	})
}

// Error sends an error JSON response.
func Error(w http.ResponseWriter, status int, code string, message string) {
	JSON(w, status, APIResponse{
		Success: false,
		Data:    nil,
		Error: &APIError{
			Code:    code,
			Message: message,
		},
	})
}

// JSON writes any value as JSON to the response writer.
func JSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
