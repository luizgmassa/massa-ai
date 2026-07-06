// E8: decorator-heavy TS — exercises the regex symbol extractor on a file that
// leans on decorators (the regex parser has no tree-sitter, so heavy decorator
// syntax can mask the real class/method signatures).
import { Component, Input, Injectable } from "./fake-decorators";

@Injectable()
@Component({
  selector: "poly-root",
  template: "<div>{{title}}</div>",
})
export class PolyRoot {
  @Input() title = "poly";

  @Component({
    selector: "poly-child",
  })
  decoratedMethod(): string {
    return this.title;
  }
}

export function polyFactory(): PolyRoot {
  return new PolyRoot();
}
