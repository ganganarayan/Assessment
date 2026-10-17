/**
 * "Download the format" - the file a tenant hands to an AI tool.
 *
 * A plain link rather than a button with a fetch: the route already sets
 * content-disposition, so the browser does the right thing with no JavaScript, and
 * this keeps working on the import screen whether or not anything else on it has
 * hydrated.
 *
 * The copy matters as much as the file. The reason people were writing imports by hand
 * and having them rejected is that nothing on this screen said a machine-readable
 * description of the format existed, so they guessed the shape from an export.
 */
export function ImportSampleLink() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-green-600/40 bg-green-600/10 p-4">
      <p className="text-sm font-medium">Writing the file with an AI tool?</p>
      <p className="text-xs text-[var(--muted-foreground)]">
        Download the format below and give it to the tool along with what you want the assessment
        to ask. It carries every field, which ones are required, the only values each setting
        accepts, and a complete working example to copy. It is generated from this build, so it is
        never out of date with what the importer will accept.
      </p>
      <div>
        <a
          href="/api/import-sample"
          download
          className="inline-block rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Download the import format
        </a>
      </div>
    </div>
  );
}
