'use client';

import { TOOL_COLORS } from '../constants/toolColors';

/**
 * ToolUsageStatistics Component
 *
 * Displays statistics about tool detections
 */
export default function ToolUsageStatistics({ detectionData }) {

  if (!detectionData || !detectionData.detections) {
    return (
      <div className="bg-white rounded-[20px] outline outline-1 outline-offset-[-1px] outline-gray-300 p-4 text-center">
        <p className="text-sm text-gray-500">No tool detection data available</p>
      </div>
    );
  }

  // Calculate statistics
  const toolCounts = {};
  const toolConfidences = {};
  let totalDetections = 0;
  let totalConfidence = 0;

  detectionData.detections.forEach(detection => {
    detection.tools.forEach(tool => {
      const toolName = tool.class_name;
      toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;

      if (!toolConfidences[toolName]) {
        toolConfidences[toolName] = [];
      }
      toolConfidences[toolName].push(tool.confidence);

      totalDetections++;
      totalConfidence += tool.confidence;
    });
  });

  // Calculate average confidence
  const avgConfidence = totalDetections > 0
    ? Math.round((totalConfidence / totalDetections) * 100)
    : 0;

  // Sort tools by count (descending)
  const sortedTools = Object.entries(toolCounts)
    .map(([name, count]) => ({
      name,
      count,
      avgConfidence: toolConfidences[name]
        ? Math.round((toolConfidences[name].reduce((a, b) => a + b, 0) / toolConfidences[name].length) * 100)
        : 0
    }))
    .sort((a, b) => b.count - a.count);

  // Find max count for bar scaling
  const maxCount = Math.max(...sortedTools.map(t => t.count), 1);

  return (
    <div className="bg-white rounded-[20px] outline outline-1 outline-offset-[-1px] outline-gray-300 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Tool Usage Statistics</h3>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 rounded-xl p-4 outline outline-1 outline-offset-[-1px] outline-gray-200">
          <div className="text-2xl font-bold text-gray-900">{totalDetections}</div>
          <div className="text-sm text-gray-500 mt-1">Total Detections</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 outline outline-1 outline-offset-[-1px] outline-gray-200">
          <div className="text-2xl font-bold text-gray-900">{avgConfidence}%</div>
          <div className="text-sm text-gray-500 mt-1">Avg Confidence</div>
        </div>
      </div>

      {/* Detections by Tool */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Detections by Tool</h4>
        <div className="space-y-3">
          {sortedTools.map((tool) => {
            const color = TOOL_COLORS[tool.name] || '#CCCCCC';
            const barWidth = (tool.count / maxCount) * 100;

            return (
              <div key={tool.name} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: color }}
                    ></div>
                    <span className="text-sm font-medium text-gray-700">{tool.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{tool.count}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: color,
                      opacity: 0.85
                    }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

