"use client";

import { useState } from "react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

export default function LocalDetectionPage() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleUpload() {
    if (!file) {
      setError("请先选择一个视频文件");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    const videoId = `local-${Date.now()}`;
    const formData = new FormData();
    formData.append("video_id", videoId);
    formData.append("video", file);

    try {
      setStatus("正在上传视频并进行 YOLO 器械检测，请等待...");

      const uploadResponse = await fetch(`${BACKEND_URL}/detect/upload`, {
        method: "POST",
        body: formData,
      });

      const uploadText = await uploadResponse.text();

      if (!uploadResponse.ok) {
        throw new Error(uploadText);
      }

      setStatus("检测完成，正在读取结果...");

      const statusResponse = await fetch(`${BACKEND_URL}/status/${videoId}`);

      if (!statusResponse.ok) {
        throw new Error("检测完成，但读取检测结果失败");
      }

      const statusData = await statusResponse.json();

      setResult(statusData);
      setStatus("完成");
    } catch (err) {
      setError(err.message || "检测失败");
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  function downloadJson() {
    if (!result) return;

    const videoId = result?.data?.video_id || "detection_result";
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${videoId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const data = result?.data;
  const summary = data?.summary;

  const rows =
    data?.detections?.flatMap((frameItem) =>
      frameItem.tools.map((tool) => ({
        frame: frameItem.frame,
        timestamp: frameItem.timestamp,
        className: tool.class_name,
        confidence: tool.confidence,
        x1: tool.bbox.x1,
        y1: tool.bbox.y1,
        x2: tool.bbox.x2,
        y2: tool.bbox.y2,
      }))
    ) || [];

  return (
    <main style={{ padding: 32, fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700 }}>
        Local Surgical Tool Detection
      </h1>

      <p style={{ marginTop: 8, color: "#555" }}>
        本页面直接调用本地 YOLO 后端，不使用 Vercel Blob，也不使用 TwelveLabs。
      </p>

      <div
        style={{
          marginTop: 24,
          padding: 24,
          border: "1px solid #ddd",
          borderRadius: 12,
          maxWidth: 760,
        }}
      >
        <input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />

        <button
          onClick={handleUpload}
          disabled={loading}
          style={{
            marginLeft: 16,
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: loading ? "#888" : "#111",
            color: "white",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Detecting..." : "Upload and Detect"}
        </button>

        {status && (
          <p style={{ marginTop: 16, color: "#0066cc" }}>
            当前状态：{status}
          </p>
        )}

        {error && (
          <p style={{ marginTop: 16, color: "red", whiteSpace: "pre-wrap" }}>
            错误：{error}
          </p>
        )}
      </div>

      {summary && (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Detection Summary</h2>

          <table
            style={{
              marginTop: 12,
              borderCollapse: "collapse",
              minWidth: 520,
            }}
          >
            <tbody>
              <tr>
                <td style={tdTitle}>Video ID</td>
                <td style={td}>{data.video_id}</td>
              </tr>
              <tr>
                <td style={tdTitle}>Model</td>
                <td style={td}>{data.model}</td>
              </tr>
              <tr>
                <td style={tdTitle}>Duration</td>
                <td style={td}>
                  {data.video_properties?.duration?.toFixed?.(2)} seconds
                </td>
              </tr>
              <tr>
                <td style={tdTitle}>Total frames processed</td>
                <td style={td}>{summary.total_frames_processed}</td>
              </tr>
              <tr>
                <td style={tdTitle}>Frames with detections</td>
                <td style={td}>{summary.frames_with_detections}</td>
              </tr>
              <tr>
                <td style={tdTitle}>Total tool detections</td>
                <td style={td}>{summary.total_tool_detections}</td>
              </tr>
            </tbody>
          </table>

          <button
            onClick={downloadJson}
            style={{
              marginTop: 16,
              padding: "10px 18px",
              borderRadius: 8,
              border: "1px solid #111",
              background: "white",
              cursor: "pointer",
            }}
          >
            Download JSON Result
          </button>
        </section>
      )}

      {rows.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Detection Details</h2>

          <table
            style={{
              marginTop: 12,
              borderCollapse: "collapse",
              width: "100%",
              maxWidth: 1100,
              fontSize: 14,
            }}
          >
            <thead>
              <tr>
                <th style={th}>Time / s</th>
                <th style={th}>Frame</th>
                <th style={th}>Tool</th>
                <th style={th}>Confidence</th>
                <th style={th}>x1</th>
                <th style={th}>y1</th>
                <th style={th}>x2</th>
                <th style={th}>y2</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 80).map((row, index) => (
                <tr key={index}>
                  <td style={td}>{row.timestamp}</td>
                  <td style={td}>{row.frame}</td>
                  <td style={td}>{row.className}</td>
                  <td style={td}>{row.confidence}</td>
                  <td style={td}>{row.x1}</td>
                  <td style={td}>{row.y1}</td>
                  <td style={td}>{row.x2}</td>
                  <td style={td}>{row.y2}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length > 80 && (
            <p style={{ marginTop: 8, color: "#666" }}>
              当前只显示前 80 条检测记录，完整结果请下载 JSON。
            </p>
          )}
        </section>
      )}
    </main>
  );
}

const th = {
  border: "1px solid #ddd",
  padding: 8,
  background: "#f5f5f5",
  textAlign: "left",
};

const td = {
  border: "1px solid #ddd",
  padding: 8,
};

const tdTitle = {
  border: "1px solid #ddd",
  padding: 8,
  fontWeight: 700,
  background: "#f5f5f5",
};