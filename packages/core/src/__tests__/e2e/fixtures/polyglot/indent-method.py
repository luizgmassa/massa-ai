# E8/E9: Python file with a method declared at indent level 8 (double-nested
# class/method). The regex symbol extractor keys off low indent levels and tends
# to miss deeply-nested defs.


class Outer:
    class Inner:
        def deeply_nested_method(self, x):
        # ↑ indent 8 — the regex parser (indent 0/4 heuristic) typically misses this
            return x + 1

    def top_level_method(self, y):
        return y * 2


def module_function(z):
    return z - 1
