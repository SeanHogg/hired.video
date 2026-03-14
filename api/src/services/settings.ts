export function defaultNotificationPreferences() {
  return {
    emailJobMatches: true,
    emailApplicationUpdates: true,
    emailMessages: true,
    emailConnectionRequests: true,
    emailWeeklyDigest: true,
    emailMarketingUpdates: false,
    pushJobMatches: true,
    pushApplicationUpdates: true,
    pushMessages: true,
    pushConnectionRequests: true,
    smsImportantUpdates: false,
    smsSecurityAlerts: true,
  };
}

export function defaultPrivacyPreferences() {
  return {
    profileVisibleToPublic: true,
    profileVisibleToRecruiters: true,
    allowSearchEngineIndexing: true,
    showActivityStatus: true,
    showConnectionsList: true,
    allowDirectMessages: true,
    allowConnectionRequests: true,
    showEmail: false,
    showPhone: false,
    showLocation: false,
    allowMessaging: true,
    shareAnalyticsData: true,
    shareUsageData: true,
    allowDataExport: true,
  };
}

export function defaultJobPreferences() {
  return {
    autoApplyEnabled: false,
    preferredJobTypes: [],
    preferredIndustries: [],
    preferredLocations: [],
    remoteOnly: false,
    willingToRelocate: false,
    minSalaryExpectation: null,
    maxSalaryExpectation: null,
    salaryCurrency: "USD",
    salaryPeriod: "yearly",
    availableFrom: null,
    noticePeriodDays: null,
    preferredWorkingHours: [],
    jobMatchThreshold: null,
    onlyExactMatches: false,
    excludedCompanies: [],
    excludedKeywords: [],
  };
}

export function defaultAccountSettings() {
  return {
    theme: "system",
    language: "en",
    timezone: "UTC",
    currency: "USD",
    dateFormat: "MM/DD/YYYY",
  };
}

export function defaultSecuritySettings() {
  return {
    twoFactorEnabled: false,
    loginNotifications: true,
    sessionTimeout: 30,
    allowedDevices: [],
  };
}
