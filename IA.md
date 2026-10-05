# 런닝메이트 IA (Information Architecture)

- 버전: v0.2
- 작성일: 2026-10-05

노트북과 아이폰은 같은 웹앱을 사용하며, 각자 자신의 데이터만 가진다.
메뉴 구성은 같고, 화면 크기에 따라 배치만 다르다.

- 아이폰(좁은 화면): 하단 탭 5개
- 노트북(넓은 화면): 왼쪽 사이드바

---

## 1. 메뉴 구조

```
런닝메이트
├── 홈
│   ├── (진행 중이던 러닝이 있으면) 복구 배너 → [이어서] / [버리기]
│   ├── 오늘의 계획 카드 → [시작]
│   ├── 이번 주 / 이번 달 거리, 목표 달성률
│   ├── 빠른 시작
│   │   ├── 자유 달리기
│   │   ├── 목표 달리기 → 목표 설정 (거리/시간, 목표 페이스)
│   │   ├── 인터벌 → 프리셋 선택
│   │   └── 실내 모드 켜기/끄기 (트레드밀)
│   └── 최근 러닝 3건 → 러닝 상세
│
├── 계획
│   ├── 주간 계획 (월~일, 요일별 편집, 완료 표시)
│   └── 목표 (주간 거리, 월간 거리)
│
├── 인터벌
│   ├── 프리셋 목록 → [시작]
│   └── 프리셋 편집 (이름, 워밍업, 구간, 반복, 쿨다운, 예상 시간/거리)
│
├── 기록
│   ├── 기간 선택 (주 / 월 / 년 / 전체)
│   ├── 통계 요약 + 거리 차트
│   ├── 개인 최고 기록
│   ├── 러닝 목록
│   │   └── 러닝 상세
│   │       ├── 요약 (거리, 시간, 평균 페이스, 칼로리)
│   │       ├── 지도 경로
│   │       ├── 구간(랩) 기록 / 인터벌 구간 기록
│   │       ├── 페이스 그래프
│   │       ├── 메모
│   │       └── 삭제
│   └── [+] 직접 입력
│
├── 설정
│   ├── 음성 코칭 (켜기/끄기, 안내 주기, 안내 항목, 신호음)
│   ├── 자동 일시정지
│   ├── 체중 (칼로리 계산용)
│   └── 데이터 내보내기 / 가져오기 / 전체 삭제
│
└── [전체 화면] 러닝 화면 (메뉴 숨김)
    ├── 준비 (GPS 신호 확인 → 3초 카운트다운)
    ├── 달리는 중
    │   ├── 메인 지표 (시간, 거리, 현재 페이스, 평균 페이스)
    │   ├── 목표 진행률 / 인터벌 정보 (현재 구간, 남은 양, 반복)
    │   ├── 지도 보기
    │   ├── [잠금] → 길게 눌러 해제
    │   ├── [건너뛰기] (인터벌)
    │   └── [일시정지] → [재개] / [종료]
    └── 종료 요약 → (실내 모드면 거리 입력) → [저장] / [삭제]
```

---

## 2. 데이터 모델

```
Run (러닝 기록)
- id, startedAt, endedAt
- type: free | goal | interval | manual
- indoor: boolean
- distanceM, durationSec (움직인 시간), elapsedSec (전체 시간)
- avgPaceSec (초/km), calories?
- route: [ {lat, lng, t(움직인 초), d(누적 m), seg(구간 번호)} ]
- laps: [ {index, distanceM, durationSec, paceSec} ]
- steps: [ {kind, label, distanceM, durationSec} ]   (인터벌일 때)
- goal?: {kind: distance | time, value, paceSec?}
- presetId?, planDate? (계획으로 시작한 날짜)
- memo?

IntervalPreset
- id, name
- warmup?: {unit: time | distance, value}
- steps: [ {kind: run | rest, unit: time | distance, value, paceSec?} ]
- repeat
- cooldown?: {unit, value}

Plan (주간 계획)
- days[7] (월~일): {type: rest | free | distance | time | interval, value?, presetId?}

Goal
- weeklyKm?, monthlyKm?

Settings
- voice, announceUnit (distance | time), announceValue, announceItems, beep
- autoPause, weightKg
```
