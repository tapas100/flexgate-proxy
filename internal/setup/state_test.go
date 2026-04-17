package setup_test

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/flexgate/proxy/internal/setup"
)

func TestStore_FreshDefaults(t *testing.T) {
	dir := t.TempDir()
	s := setup.NewStore(dir)

	st, err := s.Get()
	if err != nil {
		t.Fatalf("Get() error: %v", err)
	}
	if st.IsSetupComplete {
		t.Error("expected IsSetupComplete=false on fresh store")
	}
	if st.Mode != setup.ModeUnset {
		t.Errorf("expected mode=%q, got %q", setup.ModeUnset, st.Mode)
	}
	if st.DependenciesChecked {
		t.Error("expected DependenciesChecked=false on fresh store")
	}
	if len(st.SelectedStack) != 0 {
		t.Errorf("expected empty SelectedStack, got %v", st.SelectedStack)
	}
}

func TestStore_MarkComplete(t *testing.T) {
	dir := t.TempDir()
	s := setup.NewStore(dir)

	if err := s.MarkComplete(setup.ModeBenchmark, []string{"nginx", "redis"}); err != nil {
		t.Fatalf("MarkComplete() error: %v", err)
	}

	st, err := s.Get()
	if err != nil {
		t.Fatalf("Get() after MarkComplete error: %v", err)
	}
	if !st.IsSetupComplete {
		t.Error("expected IsSetupComplete=true")
	}
	if st.Mode != setup.ModeBenchmark {
		t.Errorf("expected mode=%q, got %q", setup.ModeBenchmark, st.Mode)
	}
	if len(st.SelectedStack) != 2 || st.SelectedStack[0] != "nginx" {
		t.Errorf("unexpected SelectedStack: %v", st.SelectedStack)
	}
	if st.CreatedAt.IsZero() {
		t.Error("expected CreatedAt to be set")
	}
	if st.UpdatedAt.IsZero() {
		t.Error("expected UpdatedAt to be set")
	}
}

func TestStore_MarkDependenciesChecked(t *testing.T) {
	dir := t.TempDir()
	s := setup.NewStore(dir)

	if err := s.MarkDependenciesChecked(); err != nil {
		t.Fatalf("MarkDependenciesChecked() error: %v", err)
	}

	st, err := s.Get()
	if err != nil {
		t.Fatalf("Get() error: %v", err)
	}
	if !st.DependenciesChecked {
		t.Error("expected DependenciesChecked=true")
	}
}

func TestStore_JSONPersistence(t *testing.T) {
	dir := t.TempDir()
	s := setup.NewStore(dir)

	if err := s.MarkComplete(setup.ModeFull, []string{"haproxy", "postgres"}); err != nil {
		t.Fatalf("MarkComplete error: %v", err)
	}

	// Read the file directly — should be valid JSON with expected fields.
	data, err := os.ReadFile(s.StateFilePath())
	if err != nil {
		t.Fatalf("ReadFile error: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("JSON parse error: %v\ncontent: %s", err, data)
	}
	if m["isSetupComplete"] != true {
		t.Errorf("on-disk isSetupComplete=%v", m["isSetupComplete"])
	}
	if m["mode"] != "full" {
		t.Errorf("on-disk mode=%v", m["mode"])
	}
}

func TestStore_CreatedAtPreservedOnResave(t *testing.T) {
	dir := t.TempDir()
	s := setup.NewStore(dir)

	if err := s.MarkDependenciesChecked(); err != nil {
		t.Fatalf(err.Error())
	}
	st1, _ := s.Get()
	firstCreatedAt := st1.CreatedAt

	time.Sleep(2 * time.Millisecond)

	if err := s.MarkComplete(setup.ModeFull, nil); err != nil {
		t.Fatalf(err.Error())
	}
	st2, _ := s.Get()

	if !st2.CreatedAt.Equal(firstCreatedAt) {
		t.Errorf("CreatedAt changed on resave: was %v, now %v", firstCreatedAt, st2.CreatedAt)
	}
	if !st2.UpdatedAt.After(firstCreatedAt) {
		t.Error("UpdatedAt should be after CreatedAt on resave")
	}
}

func TestStore_LegacySentinelMigration(t *testing.T) {
	dir := t.TempDir()
	// Write the old-style sentinel file.
	if err := os.WriteFile(dir+"/.flexgate-setup-complete", nil, 0o644); err != nil {
		t.Fatalf("WriteFile sentinel: %v", err)
	}

	s := setup.NewStore(dir)
	st, err := s.Get()
	if err != nil {
		t.Fatalf("Get() error: %v", err)
	}
	if !st.IsSetupComplete {
		t.Error("legacy sentinel should set IsSetupComplete=true")
	}
}

func TestStore_Reset(t *testing.T) {
	dir := t.TempDir()
	s := setup.NewStore(dir)

	_ = s.MarkComplete(setup.ModeFull, []string{"nginx"})

	blank := &setup.SetupState{
		IsSetupComplete:     false,
		Mode:                setup.ModeUnset,
		DependenciesChecked: false,
		SelectedStack:       []string{},
	}
	if err := s.Save(blank); err != nil {
		t.Fatalf("Save(blank) error: %v", err)
	}

	st, _ := s.Get()
	if st.IsSetupComplete {
		t.Error("expected IsSetupComplete=false after reset")
	}
	if st.Mode != setup.ModeUnset {
		t.Errorf("expected mode=%q after reset, got %q", setup.ModeUnset, st.Mode)
	}
}
