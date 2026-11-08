export type HistoryPosition = { back: boolean; forward: boolean };
const initial: HistoryPosition = { back: false, forward: false };
let snapshot = initial;
const listeners = new Set<() => void>();
let stop: (() => void) | undefined;

// Only entries visited in this app session are eligible for the toolbar's
// Back/Forward controls. Direct entry always has a real parent link instead
// of taking the user out to an unrelated site in their browser history.
function start() {
  const history = window.history;
  const scope = crypto.randomUUID();
  let index = 0;
  let maximum = 0;
  const push = history.pushState;
  const replace = history.replaceState;
  const publish = () => {
    snapshot = { back: index > 0, forward: index < maximum };
    listeners.forEach(fn => fn());
  };
  const marker = () => ({ scope, index });
  replace.call(history, { ...history.state, clariviaNavigation: marker() }, "");
  history.pushState = function (data, unused, url) {
    index += 1; maximum = index;
    push.call(this, { ...data, clariviaNavigation: marker() }, unused, url);
    publish();
  };
  history.replaceState = function (data, unused, url) {
    replace.call(this, { ...data, clariviaNavigation: marker() }, unused, url);
    publish();
  };
  const pop = () => {
    const state = history.state?.clariviaNavigation;
    if (state?.scope === scope) index = state.index;
    else { index = 0; maximum = 0; }
    publish();
  };
  window.addEventListener("popstate", pop);
  publish();
  return () => {
    history.pushState = push; history.replaceState = replace;
    window.removeEventListener("popstate", pop);
    snapshot = initial;
  };
}

export function subscribeHistory(listener: () => void) {
  listeners.add(listener);
  if (!stop) stop = start();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { stop?.(); stop = undefined; }
  };
}
export const historySnapshot = () => snapshot;
export const serverHistorySnapshot = () => initial;
