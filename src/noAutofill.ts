/**
 * Props for free-text fields that should never show AutoFill suggestions
 * (Safari's contact/address bar above the iOS keyboard, password managers).
 * Safari often ignores autocomplete="off" alone; a non-identifying name and the
 * password-manager opt-outs stop it treating the field as a form to fill.
 * Autocorrect and spelling suggestions stay on: they help when typing items.
 */
export const NO_AUTOFILL = {
  autoComplete: 'off',
  name: 'gid-entry',
  'aria-autocomplete': 'none',
  'data-form-type': 'other',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
} as const
