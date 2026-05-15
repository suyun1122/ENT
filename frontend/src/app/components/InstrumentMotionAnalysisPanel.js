"use client";

function formatNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4 outline outline-1 outline-offset-[-1px] outline-gray-200">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 truncate text-xl font-semibold text-gray-900" title={String(value)}>
        {value}
      </div>
    </div>
  );
}

function DownloadButton({ href, children }) {
  if (!href) return null;

  return (
    <a
      href={href}
      download
      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-50"
    >
      {children}
    </a>
  );
}

export default function InstrumentMotionAnalysisPanel({
  metrics,
  videoId,
  motionRows = [],
  classSummary = [],
  trackSummary = [],
}) {
  if (!metrics) {
    return (
      <div className="rounded-[20px] bg-white p-6 outline outline-1 outline-offset-[-1px] outline-gray-300">
        <h3 className="text-lg font-semibold text-gray-900">Instrument Motion Analysis</h3>
        <p className="mt-1 text-sm text-gray-500">
          Motion features are computed from instrument bounding-box centers.
        </p>
        <p className="mt-6 text-sm text-gray-600">No instrument motion data available.</p>
      </div>
    );
  }

  const classEntries = Object.entries(metrics.classCounts || {}).sort((a, b) => b[1] - a[1]);
  const motionApiBase = videoId ? `/api/motion/${encodeURIComponent(videoId)}` : "";
  const topTracks = (trackSummary || []).slice(0, 5);

  const cards = [
    ["Motion Points", formatNumber(metrics.totalDetections, 0)],
    ["Active Tools", formatNumber((metrics.activeTools || []).length, 0)],
    ["Dominant Moving Tool", metrics.dominantTool || "None"],
    ["Motion Tracks", formatNumber(metrics.uniqueTracks, 0)],
    ["Total Path Length", `${formatNumber(metrics.totalPathLengthPx, 0)} px`],
    ["Mean Speed", `${formatNumber(metrics.meanSpeedPxS, 1)} px/s`],
    ["Max Speed", `${formatNumber(metrics.maxSpeedPxS, 1)} px/s`],
    ["Working Area", `${formatNumber(metrics.workingAreaPx2, 0)} px^2`],
  ];

  return (
    <div className="rounded-[20px] bg-white p-6 outline outline-1 outline-offset-[-1px] outline-gray-300">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Instrument Motion Analysis</h3>
          <p className="mt-1 text-sm text-gray-500">
            Motion features are computed from instrument bounding-box centers.
          </p>
        </div>

        {motionApiBase && (
          <div className="flex flex-wrap gap-2">
            <DownloadButton href={`${motionApiBase}?format=csv&type=rows`}>
              Download Motion CSV
            </DownloadButton>
            <DownloadButton href={`${motionApiBase}?format=csv&type=class`}>
              Download Class CSV
            </DownloadButton>
            <DownloadButton href={`${motionApiBase}?format=csv&type=track`}>
              Download Track CSV
            </DownloadButton>
            <DownloadButton href={`${motionApiBase}?format=json`}>Download JSON</DownloadButton>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <MetricCard key={label} label={label} value={value} />
        ))}
      </div>

      <div className="mt-6 border-t border-gray-200 pt-5">
        <h4 className="text-sm font-semibold text-gray-900">Motion Data Export</h4>
        <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-gray-700 sm:grid-cols-3">
          <div className="rounded-xl bg-gray-50 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Row Records
            </div>
            <div className="mt-1 text-lg font-semibold text-gray-900">
              {formatNumber(motionRows.length, 0)}
            </div>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Class Summaries
            </div>
            <div className="mt-1 text-lg font-semibold text-gray-900">
              {formatNumber(classSummary.length, 0)}
            </div>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Track Summaries
            </div>
            <div className="mt-1 text-lg font-semibold text-gray-900">
              {formatNumber(trackSummary.length, 0)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-gray-200 pt-5">
        <h4 className="text-sm font-semibold text-gray-900">Active Tools</h4>
        {classEntries.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {classEntries.map(([toolName, count]) => (
              <span
                key={toolName}
                className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700"
              >
                {toolName}: {count}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-500">No active tools detected.</p>
        )}
      </div>

      {topTracks.length > 0 && (
        <div className="mt-6 border-t border-gray-200 pt-5">
          <h4 className="text-sm font-semibold text-gray-900">Top Motion Tracks</h4>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">Track</th>
                  <th className="whitespace-nowrap px-3 py-2">Tool</th>
                  <th className="whitespace-nowrap px-3 py-2">Path</th>
                  <th className="whitespace-nowrap px-3 py-2">Mean Speed</th>
                  <th className="whitespace-nowrap px-3 py-2">Time Range</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {topTracks.map((track) => (
                  <tr key={track.object_id}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">
                      {track.object_id}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{track.class_name}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatNumber(track.totalPathLengthPx, 0)} px
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatNumber(track.meanSpeedPxS, 1)} px/s
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatNumber(track.start_time, 1)}s - {formatNumber(track.end_time, 1)}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-gray-200 pt-5">
        <h4 className="text-sm font-semibold text-gray-900">Motion Notes</h4>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700">
          {(metrics.interpretation || []).map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="mt-6 border-t border-gray-200 pt-5">
        <div className="flex items-center justify-between gap-4">
          <h4 className="text-sm font-semibold text-gray-900">Motion Data Review</h4>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
            {metrics.possibleFalsePositiveCount || 0}
          </span>
        </div>

        {(metrics.possibleFalsePositiveReasons || []).length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
            {metrics.possibleFalsePositiveReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}

        {(metrics.possibleFalsePositiveCount || 0) > 0 && (
          <p className="mt-3 text-sm text-amber-700">
            Some motion points may be affected by non-instrument objects such as clothing,
            background edges, or visual occlusion. These points are not removed from the
            original overlay, timeline, or statistics.
          </p>
        )}
      </div>
    </div>
  );
}
