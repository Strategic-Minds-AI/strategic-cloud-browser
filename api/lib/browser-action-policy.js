// X1 public API action allowlist — aligned to safe CloudBrowser interactions.
// Keep this intentionally smaller than internal Playwright/engine commands.
// Never accept arbitrary JS, CDP, credentials, filesystem or proxy actions.
export const ALLOWED_SESSION_ACTIONS = Object.freeze([
  "goto", "back", "forward", "reload", "wait_for_selector", "wait_for_load_state",
  "click", "hover", "type", "fill", "press", "select_option", "scroll",
  "extract_text", "extract_html", "extract_attribute", "extract_table", "screenshot",
]);

const selectorsRequired = new Set([
  "wait_for_selector", "click", "hover", "type", "fill",
  "select_option", "extract_attribute", "extract_table",
]);
const optionsByAction = {
  goto: ["timeout", "waitUntil"],
  back: ["timeout"], forward: ["timeout"], reload: ["timeout"],
  wait_for_selector: ["timeout", "state"],
  wait_for_load_state: ["timeout", "state"],
  click: ["timeout", "button"],
  hover: [],
  type: ["delay"],
  fill: [],
  press: [],
  select_option: [],
  scroll: [],
  extract_text: [], extract_html: [], extract_attribute: ["attribute"],
  extract_table: [],
  screenshot: ["fullPage"],
};
const fail = (message) => {
  const error = new Error(message);
  error.code = "INVALID_BROWSER_ACTION";
  throw error;
};
const stringWithin = (str, max) => typeof str === "string" && str.length > 0 && str.length <= max;
export function buildSafeBrowserAction(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Action must be an object");
  for (const field of Object.keys(input)) {
    if (!["action_type", "selector", "value", "options"].includes(field))
      fail("Unsupported browser action field");
  }
  const actionType = input.action_type;
  if (!ALLOWED_SESSION_ACTIONS.includes(actionType)) fail("Unsupported session action");
  const selector = input.selector;
  if (selector !== undefined && !stringWithin(selector, 2048)) fail("Invalid selector");
  if (selectorsRequired.has(actionType) && !stringWithin(selector, 2048))
    fail("Selector required for action");
  if (actionType === "goto" && !stringWithin(input.value || selector, 4096))
    fail("URL required for navigation");

  let value = input.value;
  if (actionType === "select_option") {
    if (!(stringWithin(value, 2048) ||
      (Array.isArray(value) && value.length > 0 && value.length <= 10 &&
        value.every((v) => stringWithin(v, 2048))))) fail("Invalid select option");
  } else if (actionType === "scroll" && value !== undefined) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < -2500 || n > 2500) fail("Scroll amount out of range");
    value = String(n);
  } else if (value !== undefined && (typeof value !== "string" || value.length > 25000)) {
    fail("Invalid action value");
  }
  if (["type", "press"].includes(actionType) && !stringWithin(value, 25000))
    fail("Value required for action");
  // An empty fill is a legitimate "clear input" interaction.
  if (actionType === "fill" && (typeof value !== "string" || value.length > 25000))
    fail("Invalid fill value");

  const inputOptions = input.options ?? {};
  if (!inputOptions || typeof inputOptions !== "object" || Array.isArray(inputOptions))
    fail("options must be an object");
  const allowedOptions = optionsByAction[actionType] || [];
  for (const field of Object.keys(inputOptions))
    if (!allowedOptions.includes(field)) fail("Unsupported browser option");
  const options = { ...inputOptions };
  if (options.timeout !== undefined &&
    (!Number.isInteger(options.timeout) || options.timeout < 50 || options.timeout > 60000))
    fail("Timeout out of range");
  if (options.delay !== undefined &&
    (!Number.isInteger(options.delay) || options.delay < 0 || options.delay > 150))
    fail("Typing delay out of range");
  if (options.waitUntil !== undefined &&
    !["domcontentloaded", "load", "networkidle", "commit"].includes(options.waitUntil))
    fail("Invalid navigation wait state");
  if (options.state !== undefined &&
    !((actionType === "wait_for_selector"
      ? ["attached", "detached", "visible", "hidden"]
      : ["domcontentloaded", "load", "networkidle"]).includes(options.state)))
    fail("Invalid wait state");
  if (options.button !== undefined &&
    !["left", "middle", "right"].includes(options.button)) fail("Invalid mouse button");
  if (options.attribute !== undefined &&
    !/^[a-zA-Z_:][\w:.-]{0,79}$/.test(options.attribute)) fail("Invalid attribute");
  if (options.fullPage !== undefined && typeof options.fullPage !== "boolean")
    fail("Invalid screenshot option");

  return { action_type: actionType, selector, value, options };
}
