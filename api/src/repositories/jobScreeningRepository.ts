/**
 * Job screening repository — the interview question set a job attaches for
 * apply-time screening (`job_items.screening_question_set_id`). The job-side
 * columns are read/written through JobsRepository; the question-set lookup is
 * owned by InterviewQuestionSetsRepository (re-exported here for the job
 * screening use cases).
 */
export { findQuestionSetById, type QuestionSetRow } from "./interviewQuestionSetsRepository.js";
