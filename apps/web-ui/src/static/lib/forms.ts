/** The subset of an input element `collectFormData` reads. Structural, not
 *  `HTMLInputElement`, so the fake-DOM test harness (a plain array with
 *  `forEach`, not a real `NodeList`) still satisfies it. */
interface FormFieldElement {
  dataset: { create?: string; [key: string]: string | undefined };
  type: string;
  checked?: boolean;
  value: string;
}

/** The subset of a DOM root `collectFormData` needs: a selector query that
 *  returns something `forEach`-able. */
interface FormDataRoot {
  querySelectorAll(selectors: string): { forEach(cb: (el: FormFieldElement) => void): void };
}

/**
 * Reads a `data-form` group out of the rendered DOM.
 *
 * Every create form in the app marks its inputs with `data-form="<name>"` and
 * `data-create="<key>"`; this turns one such group into a plain object, with
 * checkbox and number inputs coerced to their real types rather than strings.
 * An empty number field becomes `undefined` (absent), never `0` or `NaN`.
 */
export function collectFormData(root: FormDataRoot, formName: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  root.querySelectorAll('[data-form="' + formName + '"]').forEach((el) => {
    const key = el.dataset.create;
    if (!key) return;
    if (el.type === "checkbox") data[key] = el.checked;
    else if (el.type === "number") data[key] = el.value === "" ? undefined : Number(el.value);
    else data[key] = el.value;
  });
  return data;
}
