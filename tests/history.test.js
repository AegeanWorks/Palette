import test from "node:test";
import assert from "node:assert/strict";

import { History, createCommand } from "../src/core/history.js";

test("undo and redo replay commands in order", () => {
  const log = [];
  const history = new History({ limit: 5 });
  history.push(createCommand("one", () => log.push("undo one"), () => log.push("redo one")));
  history.push(createCommand("two", () => log.push("undo two"), () => log.push("redo two")));
  assert.equal(history.canUndo, true);
  assert.equal(history.canRedo, false);
  assert.equal(history.undoLabel, "two");

  assert.equal(history.undo().label, "two");
  assert.equal(history.undo().label, "one");
  assert.equal(history.undo(), null);
  assert.deepEqual(log, ["undo two", "undo one"]);

  assert.equal(history.redo().label, "one");
  assert.equal(history.redo().label, "two");
  assert.equal(history.redo(), null);
  assert.deepEqual(log.slice(2), ["redo one", "redo two"]);
});

test("a new command clears the redo branch", () => {
  const history = new History();
  history.push(createCommand("a", () => {}, () => {}));
  history.undo();
  assert.equal(history.canRedo, true);
  history.push(createCommand("b", () => {}, () => {}));
  assert.equal(history.canRedo, false);
  assert.equal(history.undoLabel, "b");
});

test("history is bounded and drops the oldest command", () => {
  const history = new History({ limit: 2 });
  const labels = [];
  for (const label of ["a", "b", "c"]) {
    history.push(createCommand(label, () => labels.push(`undo-${label}`), () => labels.push(`redo-${label}`)));
  }
  history.undo();
  history.undo();
  history.undo();
  assert.deepEqual(labels, ["undo-c", "undo-b"]);
  assert.equal(history.canUndo, false);
});

test("subscribers fire on push, undo, redo and clear", () => {
  const history = new History();
  let calls = 0;
  const unsubscribe = history.subscribe(() => {
    calls += 1;
  });
  history.push(createCommand("a", () => {}, () => {}));
  history.undo();
  history.redo();
  history.clear();
  unsubscribe();
  history.push(createCommand("b", () => {}, () => {}));
  assert.equal(calls, 4);
});

test("malformed commands are rejected", () => {
  assert.throws(() => createCommand("bad", null, () => {}), TypeError);
  assert.throws(() => new History().push({ label: "bad" }), TypeError);
});
