package terminal

type message struct {
	Type      string `json:"type"`
	SessionID string `json:"session_id,omitempty"`
	Data      string `json:"data,omitempty"`
	Cols      int    `json:"cols,omitempty"`
	Rows      int    `json:"rows,omitempty"`
	Reason    string `json:"reason,omitempty"`
}

const (
	messageSessionStart = "session_start"
	messageInput        = "input"
	messageOutput       = "output"
	messageResize       = "resize"
	messageSessionClose = "session_close"
	messageError        = "error"
	messageExit         = "exit"
)
