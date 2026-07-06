// E11: unsupported extension (.go). The symbol extractor only walks a known set
// of languages (TS/JS/Python/Dart/Kotlin/...). A .go file should yield zero
// symbols and zero import edges — silently skipped, not an error.

package poly

import "fmt"

func PolyGo(n int) int {
	fmt.Println("poly", n)
	return n + 1
}

type PolyStruct struct {
	ID int
}
