# Google Colab Resume Training 체크리스트

## ✅ 준비 사항

### 1. 파일 준비

#### 1.1 best.pt 모델 파일
- **위치:** `cv_model/training_scripts/best.pt`
- **크기:** ~39MB
- **설명:** 이전에 100 epochs 학습한 최고 성능 모델

**할 일:**
- [ ] 이 파일을 Google Drive에 업로드
- [ ] 업로드 경로: `Google Drive > surgical_tool_training > best.pt`

#### 1.2 데이터셋
데이터셋은 두 가지 방법으로 준비 가능:

**방법 A: Google Drive 업로드 (추천)**
- [ ] 데이터셋 압축: `cv_model/Cholec80.v3-cholec80-10.yolov11` 폴더를 ZIP으로 압축
- [ ] Google Drive에 업로드: `Google Drive > surgical_tool_training > Cholec80.v3-cholec80-10.yolov11.zip`

**방법 B: Roboflow API (대안)**
- [ ] Roboflow API key 준비
- [ ] Colab에서 직접 다운로드 (가이드 참조)

---

## 📋 실행 순서

### Step 1: Google Drive에 파일 업로드
1. Google Drive 열기
2. `surgical_tool_training` 폴더 생성
3. 다음 파일 업로드:
   - `best.pt` (필수)
   - `Cholec80.v3-cholec80-10.yolov11.zip` (선택)

### Step 2: Google Colab 접속
1. https://colab.research.google.com 접속
2. "새 노트북" 생성
3. GPU 활성화 (런타임 → 런타임 유형 변경 → T4 GPU)

### Step 3: 코드 실행
`COLAB_RESUME_TRAINING.md` 파일의 셀들을 순서대로 실행:
- [ ] 셀 1: 환경 설정
- [ ] 셀 2: Google Drive 마운트
- [ ] 셀 3: 작업 디렉토리 생성
- [ ] 셀 4: 데이터셋 준비
- [ ] 셀 5: data.yaml 경로 수정
- [ ] 셀 6: Resume training 스크립트 생성
- [ ] 셀 7: 트레이닝 실행 ⏰ (약 3-4시간)
- [ ] 셀 8: 결과 확인
- [ ] 셀 9: Google Drive 저장 확인

### Step 4: 결과 다운로드
Google Drive에서 다운로드:
- [ ] `best_resumed.pt` - 새로운 최고 성능 모델
- [ ] `last_resumed.pt` - 마지막 epoch 모델
- [ ] `results.png` - 학습 곡선

### Step 5: Local에서 테스트
- [ ] `best_resumed.pt`를 프로젝트로 복사
- [ ] Inference 스크립트로 테스트
- [ ] 성능 개선 확인

---

## 💡 팁

1. **Colab 연결 유지:**
   - 브라우저 탭을 닫지 마세요
   - 가끔씩 확인해서 연결이 끊기지 않았는지 체크

2. **중간 저장:**
   - Training 중간에 자동으로 checkpoints 저장됨
   - 연결이 끊겨도 일부 결과는 남아있음

3. **성능 개선 기대치:**
   - 이전: mAP50 0.871, Precision 0.889
   - 목표: mAP50 0.90+, Precision 0.92+

4. **시간 관리:**
   - 50 epochs: 약 3-4시간
   - 시간이 충분한 때 시작하세요

---

## ❓ 문제 해결

### Out of Memory 에러
→ Batch size를 8 → 4로 줄이기

### 데이터셋 경로 에러
→ data.yaml 절대 경로 확인

### Google Drive 연결 끊김
→ 셀 2부터 다시 실행

### Training이 너무 느림
→ GPU 활성화 확인 (T4 선택했는지)

---

## 📊 예상 결과

Training 완료 후 확인할 지표:
- **mAP50:** 0.90+ (이전: 0.871)
- **Precision:** 0.92+ (이전: 0.889)
- **Recall:** 0.85+ (이전: 0.825)

특히 Grasper 외 다른 tool들의 detection 정확도가 향상될 것으로 기대합니다!

---

준비되면 시작하세요! 🚀


