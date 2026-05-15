// Shared tool color mapping for surgical instruments
// Used by: ToolDetectionOverlay, ToolUsageTimeline, ToolUsageStatistics

export const TOOL_COLORS = {
  'Bipolar': '#E53935',      // Red
  'Clipper': '#00ACC1',      // Cyan/Teal
  'Grasper': '#FDD835',      // Yellow
  'Hook': '#43A047',         // Green
  'Irrigator': '#1E88E5',    // Blue
  'Scissors': '#8E24AA',     // Purple
  'Specimen Bag': '#F48FB1', // Pink
  'Bag': '#F48FB1',

  // Latest local model classes from backend/best.pt
  'clamp': '#E53935',
  'needle_holder': '#FDD835',
  'scalpel': '#1E88E5',
  'shear': '#43A047',
  'tweezer': '#8E24AA'
};
