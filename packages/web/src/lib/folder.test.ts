import { test, expect } from "bun:test";
import { deleteFromFolder } from "./folder";
import type { FsDirHandle } from "./collect";

/** A directory tree that records what got removed, standing in for the real
 *  File System Access handles (which need a user gesture and a real folder). */
function fakeDir(name: string, children: Record<string, FsDirHandle> = {}) {
  const removed: string[] = [];
  const dir = {
    kind: "directory" as const,
    name,
    entries: (() => {}) as unknown as FsDirHandle["entries"],
    getDirectoryHandle: async (part: string) => {
      const child = children[part];
      if (!child) throw new Error(`no such dir: ${part}`);
      return child;
    },
    removeEntry: async (n: string) => { removed.push(n); },
  } as unknown as FsDirHandle;
  return { dir, removed };
}

test("deleteFromFolder removes a file in the root", async () => {
  const { dir, removed } = fakeDir("Belege");
  await deleteFromFolder(dir, "BytePlus-2026-07-07.pdf");
  expect(removed).toEqual(["BytePlus-2026-07-07.pdf"]);
});

test("deleteFromFolder walks into the statement's subfolder first", async () => {
  const sub = fakeDir("2026");
  const { dir } = fakeDir("Belege", { "2026": sub.dir });
  await deleteFromFolder(dir, "2026/BytePlus-2026-07-07.pdf");
  expect(sub.removed).toEqual(["BytePlus-2026-07-07.pdf"]);
});

test("deleteFromFolder cannot be walked out of the picked folder", async () => {
  // "../" segments are dropped rather than followed — a path is only ever a
  // location inside the folder the user picked.
  const { dir, removed } = fakeDir("Belege");
  await deleteFromFolder(dir, "../../secrets.pdf");
  expect(removed).toEqual(["secrets.pdf"]);
});

test("deleteFromFolder refuses a path with no file name", async () => {
  const { dir, removed } = fakeDir("Belege");
  await expect(deleteFromFolder(dir, "   /")).rejects.toThrow();
  expect(removed).toEqual([]);
});

test("deleteFromFolder reports a browser that cannot delete", async () => {
  const dir = { kind: "directory", name: "Belege" } as unknown as FsDirHandle;
  await expect(deleteFromFolder(dir, "x.pdf")).rejects.toThrow(/löschen/i);
});
