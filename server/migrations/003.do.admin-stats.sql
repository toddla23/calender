-- 관리자 통계(F18): 사용자별 최근 저장 요청 수를 세기 위한 인덱스
ALTER TABLE applied_ops ADD KEY idx_ops_user_created (user_id, created_at);
