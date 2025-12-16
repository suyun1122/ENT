## Issues to Fix

### 1. **Model Performance Metrics Error**

• **PRD states**: "98.5% precision"
• **Actual model performance**:

- mAP50: 0.871 (87.1%)
- Precision: 0.889 (88.9%)
- Recall: 0.825 (82.5%)
  • **Action Required**: Update PRD from "98.5% precision" to "88.9% precision" or "mAP50: 87.1%"
  • **Success Criteria**: Adjust "≥95% tool detection precision" to realistic target (e.g., ≥85-90%)

### 2. **AWS Integration Not Required**

• **PRD includes**: AWS S3 for video storage
• **Correction**: AWS integration is NOT needed
• **Action Required**: Remove AWS S3 from technology stack and requirements
• **Alternative**: Twelve Labs storage only (vidoes that are indexed with Twelve Labs are accessible via Twelve Labs GET video(s))

### 3. **GPU Compute Not Required**

• **PRD includes**: "GPU compute (NVIDIA T4+)" in technology stack
• **Correction**: GPU compute is NOT needed for inference
• **Reason**: Model training is already complete
• **Action Required**: Remove GPU compute requirement from P0/P1 specifications

### 4. **Report Format Specification**

• **PRD states**: Generic report format
• **Correction**: Operative notes/reports must follow **SOAP format** (Subjective, Objective, Assessment, and Plan)
• **Action Required**:

- Update report generation requirements to specify SOAP format
- Define structure:
  - **Subjective**: Surgeon observations, procedure context
  - **Objective**: Tool usage data, detection results, timestamps
  - **Assessment**: Analysis of tool usage patterns, efficiency metrics
  - **Plan**: Recommendations, follow-up actions
