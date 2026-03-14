import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
export const recruiterRoutes = new Hono<{ Variables: Variables }>();

const now = () => new Date().toISOString();

const baseTalentPoolEntry = {
	id: "stub-talent",
	recruiterUserId: "",
	candidateUserId: "",
	candidateName: "",
	candidateEmail: "",
	candidateTitle: "",
	candidateProfilePicture: "",
	relationshipStrength: "warm",
	tags: [] as string[],
	poolName: "default",
	status: "active",
	notes: "",
	currentCompany: "",
	currentTitle: "",
	desiredSalary: 0,
	preferredLocations: "",
	lastContactedAt: now(),
	nextFollowUpAt: now(),
	contactFrequency: "monthly",
	createdAt: now(),
	updatedAt: now(),
};

const baseInteraction = {
	id: "stub-interaction",
	talentPoolId: "stub-talent",
	interactionType: "note",
	subject: "",
	notes: "",
	outcome: "",
	interactionDate: now(),
	durationMinutes: 0,
	requiresFollowUp: false,
	followUpDate: now(),
	createdAt: now(),
};

const responseEnvelope = <T>(data: T) => ({
	success: true,
	data,
	errorMessage: null,
	errorCode: null,
});

// Talent pool
recruiterRoutes.post("/talent-pool", async (c) =>
	c.json(success(baseTalentPoolEntry), 200),
);
recruiterRoutes.get("/talent-pool", async (c) =>
	c.json(success([]), 200),
);
recruiterRoutes.get("/talent-pool/:id", async (c) =>
	c.json(success({ ...baseTalentPoolEntry, id: c.req.param("id") }), 200),
);
recruiterRoutes.put("/talent-pool/:id", async (c) =>
	c.json(success({ ...baseTalentPoolEntry, id: c.req.param("id") }), 200),
);
recruiterRoutes.delete("/talent-pool/:id", async (c) =>
	c.json(success({ success: true }), 200),
);
recruiterRoutes.get("/talent-pool/check/:candidateUserId", async (c) =>
	c.json(success(false), 200),
);

// Interactions
recruiterRoutes.post("/interactions", async (c) =>
	c.json(success(baseInteraction), 200),
);
recruiterRoutes.get("/interactions/:talentPoolId", async (c) =>
	c.json(success([]), 200),
);

// Placements (legacy envelope expected by frontend parser)
recruiterRoutes.post("/placements", async (c) =>
	c.json(responseEnvelope({
		id: "stub-placement",
		submissionId: "",
		recruiterUserId: "",
		recruiterName: "",
		candidateUserId: "",
		candidateName: "",
		jobId: "",
		jobTitle: "",
		companyName: "",
		startDate: now(),
		annualSalary: 0,
		commissionPercentage: 0,
		commissionAmount: 0,
		commissionStatus: "Pending",
		commissionPaidDate: null,
		paymentReference: null,
		guaranteePeriodDays: null,
		guaranteeEndDate: null,
		guaranteeMetStatus: null,
		notes: null,
		placedAt: now(),
		updatedAt: now(),
	})),
);
recruiterRoutes.get("/placements", async (c) => c.json(responseEnvelope([]), 200));
recruiterRoutes.get("/placements/:id", async (c) =>
	c.json(responseEnvelope({
		id: c.req.param("id"),
		submissionId: "",
		recruiterUserId: "",
		recruiterName: "",
		candidateUserId: "",
		candidateName: "",
		jobId: "",
		jobTitle: "",
		companyName: "",
		startDate: now(),
		annualSalary: 0,
		commissionPercentage: 0,
		commissionAmount: 0,
		commissionStatus: "Pending",
		commissionPaidDate: null,
		paymentReference: null,
		guaranteePeriodDays: null,
		guaranteeEndDate: null,
		guaranteeMetStatus: null,
		notes: null,
		placedAt: now(),
		updatedAt: now(),
	})),
);
recruiterRoutes.put("/placements/:id/commission", async (c) =>
	c.json(responseEnvelope({
		id: c.req.param("id"),
		submissionId: "",
		recruiterUserId: "",
		recruiterName: "",
		candidateUserId: "",
		candidateName: "",
		jobId: "",
		jobTitle: "",
		companyName: "",
		startDate: now(),
		annualSalary: 0,
		commissionPercentage: 0,
		commissionAmount: 0,
		commissionStatus: "Paid",
		commissionPaidDate: null,
		paymentReference: null,
		guaranteePeriodDays: null,
		guaranteeEndDate: null,
		guaranteeMetStatus: null,
		notes: null,
		placedAt: now(),
		updatedAt: now(),
	})),
);
recruiterRoutes.put("/placements/:id/guarantee", async (c) =>
	c.json(responseEnvelope({
		id: c.req.param("id"),
		submissionId: "",
		recruiterUserId: "",
		recruiterName: "",
		candidateUserId: "",
		candidateName: "",
		jobId: "",
		jobTitle: "",
		companyName: "",
		startDate: now(),
		annualSalary: 0,
		commissionPercentage: 0,
		commissionAmount: 0,
		commissionStatus: "Pending",
		commissionPaidDate: null,
		paymentReference: null,
		guaranteePeriodDays: null,
		guaranteeEndDate: null,
		guaranteeMetStatus: true,
		notes: null,
		placedAt: now(),
		updatedAt: now(),
	})),
);
recruiterRoutes.get("/placements/summary/commission", async (c) =>
	c.json(responseEnvelope({
		totalEarned: 0,
		totalPending: 0,
		totalPaid: 0,
		totalPlacements: 0,
		placementsThisMonth: 0,
		placementsThisYear: 0,
		averagePlacementValue: 0,
	})),
);

// Submissions (legacy envelope expected by frontend parser)
recruiterRoutes.post("/submissions", async (c) =>
	c.json(responseEnvelope({
		id: "stub-submission",
		recruiterUserId: "",
		recruiterName: "",
		candidateUserId: "",
		candidateName: "",
		candidateEmail: "",
		jobId: "",
		jobTitle: "",
		companyName: "",
		resumeId: null,
		coverLetter: null,
		recruiterNotes: null,
		proposedSalary: null,
		availableStartDate: null,
		status: "Submitted",
		statusNotes: null,
		interviewDate: null,
		withdrawalReason: null,
		withdrawalNotes: null,
		withdrawnAt: null,
		submittedAt: now(),
		updatedAt: now(),
	})),
);
recruiterRoutes.get("/submissions", async (c) => c.json(responseEnvelope([]), 200));
recruiterRoutes.get("/submissions/:id", async (c) =>
	c.json(responseEnvelope({
		id: c.req.param("id"),
		recruiterUserId: "",
		recruiterName: "",
		candidateUserId: "",
		candidateName: "",
		candidateEmail: "",
		jobId: "",
		jobTitle: "",
		companyName: "",
		resumeId: null,
		coverLetter: null,
		recruiterNotes: null,
		proposedSalary: null,
		availableStartDate: null,
		status: "Submitted",
		statusNotes: null,
		interviewDate: null,
		withdrawalReason: null,
		withdrawalNotes: null,
		withdrawnAt: null,
		submittedAt: now(),
		updatedAt: now(),
	})),
);
recruiterRoutes.put("/submissions/:id/status", async (c) =>
	c.json(responseEnvelope({
		id: c.req.param("id"),
		recruiterUserId: "",
		recruiterName: "",
		candidateUserId: "",
		candidateName: "",
		candidateEmail: "",
		jobId: "",
		jobTitle: "",
		companyName: "",
		resumeId: null,
		coverLetter: null,
		recruiterNotes: null,
		proposedSalary: null,
		availableStartDate: null,
		status: "Interview",
		statusNotes: null,
		interviewDate: null,
		withdrawalReason: null,
		withdrawalNotes: null,
		withdrawnAt: null,
		submittedAt: now(),
		updatedAt: now(),
	})),
);
recruiterRoutes.post("/submissions/:id/withdraw", async (c) =>
	c.json(responseEnvelope({
		id: c.req.param("id"),
		recruiterUserId: "",
		recruiterName: "",
		candidateUserId: "",
		candidateName: "",
		candidateEmail: "",
		jobId: "",
		jobTitle: "",
		companyName: "",
		resumeId: null,
		coverLetter: null,
		recruiterNotes: null,
		proposedSalary: null,
		availableStartDate: null,
		status: "Withdrawn",
		statusNotes: null,
		interviewDate: null,
		withdrawalReason: null,
		withdrawalNotes: null,
		withdrawnAt: now(),
		submittedAt: now(),
		updatedAt: now(),
	})),
);
recruiterRoutes.get("/submissions/job/:jobId", async (c) => c.json(responseEnvelope([]), 200));

recruiterRoutes.all("*", (c) =>
	c.json({ error: { code: "NOT_IMPLEMENTED", message: "Recruiter routes coming soon" } }, 501),
);
