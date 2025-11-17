package util

import (
	"bufio"
	"bytes"
	"fmt"
	"image"
	"io"
	"io/fs"
	"sync"

	"github.com/corona10/goimagehash"
	avif "github.com/vegidio/avif-go"
	"golang.org/x/image/webp"

	// Pure-Go Decoder-Registrierungen
	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/tiff"
)

var (
	webpMagicRIFF = []byte("RIFF") // 0..3
	webpMagicWEBP = []byte("WEBP") // 8..11

	isobmffFtyp = []byte("ftyp")
	brandAVIF   = []byte("avif")
	brandAVIS   = []byte("avis")
)

func LoadAndHash(f fs.File) (*goimagehash.ImageHash, string, error) {
	data, err := io.ReadAll(f)
	if err != nil {
		return nil, "", fmt.Errorf("read file: %w", err)
	}

	img, format, err := decodeAuto(data)
	if err != nil {
		return nil, "", err
	}

	var h *goimagehash.ImageHash
	h, err = goimagehash.PerceptionHash(img)
	if err != nil {
		return nil, "", fmt.Errorf("hash: %w", err)
	}

	return h, format, nil
}

func decodeAuto(b []byte) (image.Image, string, error) {
	if isWebP(b) {
		img, err := webp.Decode(bytes.NewReader(b))
		return img, "webp", err
	}

	if isAVIF(b) {
		img, err := avif.Decode(bytes.NewReader(b))
		return img, "avif", err
	}

	// JPEG/PNG/GIF/BMP/TIFF/… via image.Decode
	bufr := bufio.NewReader(bytes.NewReader(b))
	_, format, _ := image.DecodeConfig(bufr)

	img, format2, err := image.Decode(bytes.NewReader(b))
	if err != nil {
		return nil, "", fmt.Errorf("decode image: %w", err)
	}

	if format == "" {
		format = format2
	}
	if format == "jpeg" {
		format = "jpg"
	}

	return img, format, nil
}

func isWebP(b []byte) bool {
	return len(b) >= 12 && bytes.Equal(b[0:4], webpMagicRIFF) && bytes.Equal(b[8:12], webpMagicWEBP)
}
func isAVIF(b []byte) bool {
	if len(b) < 16 || !bytes.Equal(b[4:8], isobmffFtyp) {
		return false
	}
	end := len(b)
	if end > 64 {
		end = 64
	}
	window := b[8:end]
	return bytes.Contains(window, brandAVIF) || bytes.Contains(window, brandAVIS)
}

// --- BK-Tree über goimagehash.ImageHash (Hamming-Distanz) ---

type bkNode struct {
	Hash   *goimagehash.ImageHash
	Edges  map[int]*bkNode // Distanz -> Kind
	Source string          // z.B. Pfad/ID
}

type bkTree struct {
	Root *bkNode
}

func (t *bkTree) insert(h *goimagehash.ImageHash, src string) error {
	n := &bkNode{Hash: h, Edges: make(map[int]*bkNode), Source: src}
	if t.Root == nil {
		t.Root = n
		return nil
	}
	cur := t.Root
	for {
		d, err := cur.Hash.Distance(h)
		if err != nil {
			return err
		}
		if next, ok := cur.Edges[d]; ok {
			cur = next
			continue
		}
		cur.Edges[d] = n
		return nil
	}
}

func (t *bkTree) search(q *goimagehash.ImageHash, radius int) ([]*bkNode, error) {
	if t.Root == nil {
		return nil, nil
	}
	out := make([]*bkNode, 0, 16)
	var dfs func(n *bkNode) error
	dfs = func(n *bkNode) error {
		d, err := n.Hash.Distance(q)
		if err != nil {
			return err
		}
		if d <= radius {
			out = append(out, n)
		}
		minD, maxD := d-radius, d+radius
		for dist, child := range n.Edges {
			if dist >= minD && dist <= maxD {
				if err := dfs(child); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if err := dfs(t.Root); err != nil {
		return nil, err
	}
	return out, nil
}

type Result struct {
	Source   string
	Distance int
	Hash     *goimagehash.ImageHash
}

type Index struct {
	mu       sync.RWMutex
	tree     bkTree
	bySource map[string]*goimagehash.ImageHash
}

func NewIndex() *Index {
	return &Index{
		bySource: make(map[string]*goimagehash.ImageHash),
	}
}

func (ix *Index) AddFile(name string, f fs.File) (*goimagehash.ImageHash, error) {
	h, _, err := LoadAndHash(f)
	if err != nil {
		return nil, err
	}

	ix.mu.Lock()
	defer ix.mu.Unlock()

	if err := ix.addHashLocked(name, h); err != nil {
		return nil, err
	}

	return h, nil
}

func (ix *Index) AddHash(name string, h *goimagehash.ImageHash) error {
	if h == nil {
		return fmt.Errorf("hash is nil")
	}

	ix.mu.Lock()
	defer ix.mu.Unlock()

	return ix.addHashLocked(name, h)
}

func (ix *Index) addHashLocked(name string, h *goimagehash.ImageHash) error {
	if err := ix.tree.insert(h, name); err != nil {
		return err
	}
	ix.bySource[name] = h
	return nil
}

// radius: 0–5 sehr ähnlich, 6–10 ähnlich.
func (ix *Index) FindSimilar(q *goimagehash.ImageHash, radius int) ([]Result, error) {
	ix.mu.RLock()
	defer ix.mu.RUnlock()

	nodes, err := ix.tree.search(q, radius)
	if err != nil {
		return nil, err
	}

	results := make([]Result, 0, len(nodes))
	for _, n := range nodes {
		d, _ := n.Hash.Distance(q)
		results = append(results, Result{Source: n.Source, Distance: d, Hash: n.Hash})
	}

	for i := 0; i < len(results)-1; i++ {
		for j := i + 1; j < len(results); j++ {
			if results[j].Distance < results[i].Distance {
				results[i], results[j] = results[j], results[i]
			}
		}
	}

	return results, nil
}
