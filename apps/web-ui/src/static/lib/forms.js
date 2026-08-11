/**
 * Reads a `data-form` group out of the rendered DOM.
 *
 * Every create form in the app marks its inputs with `data-form="<name>"` and
 * `data-create="<key>"`; this turns one such group into a plain object, with
 * checkbox and number inputs coerced to their real types rather than strings.
 * An empty number field becomes `undefined` (absent), never `0` or `NaN`.
 */
export function collectFormData(root, formName) {
  const data = {};
  root.querySelectorAll('[data-form="' + formName + '"]').forEach((el) => {
    const key = el.dataset.create;
    if (!key) return;
    if (el.type === "checkbox") data[key] = el.checked;
    else if (el.type === "number") data[key] = el.value === "" ? undefined : Number(el.value);
    else data[key] = el.value;
  });
  return data;
}
