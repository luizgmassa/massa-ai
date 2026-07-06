// E9 supplementary: Kotlin file — supported language but exercises the regex
// extractor on a JVM syntax. Class + function + companion object.

package poly.fixture

class PolyKotlin(val id: Int) {
    fun describe(): String = "poly-$id"

    companion object {
        const val LABEL = "poly"
    }
}

fun polyTopLevel(s: String): Int = s.length
