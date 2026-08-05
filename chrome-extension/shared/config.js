export const BACKEND_BASE_URL = 'http://127.0.0.1:8765';
export const STATUS_URL = `${BACKEND_BASE_URL}/status`;
export const HEALTH_URL = `${BACKEND_BASE_URL}/health`;
export const REFRESH_URL = `${BACKEND_BASE_URL}/refresh`;
export const BACKEND_CONFIG_URL = `${BACKEND_BASE_URL}/backend-config`;
export const IGNORE_MAIL_URL = `${BACKEND_BASE_URL}/ignore-mail`;
export const MARK_MAIL_READ_URL = `${BACKEND_BASE_URL}/mark-mail-read`;
export const CLEAR_IGNORED_URL = `${BACKEND_BASE_URL}/clear-ignored-mails`;
export const CLEAN_OLD_CODE_MAILS_URL = `${BACKEND_BASE_URL}/clean-old-code-mails`;
export const POLLING_URL = `${BACKEND_BASE_URL}/polling`;
export const DIAGNOSTICS_URL = `${BACKEND_BASE_URL}/diagnostics`;
export const BACKEND_ADMIN_URL = `${BACKEND_BASE_URL}/admin/`;

export const STORAGE_KEYS = {
  STATUS: 'qqMailStatus',
  SETTINGS: 'qqMailSettings',
  LAST_UNREAD_BY_ACCOUNT: 'qqMailLastUnreadByAccount'
};

export const ALARM_NAME = 'qqMailStatusPoll';
export const POLL_INTERVAL_MINUTES = 1;
export const FETCH_TIMEOUT_MS = 10000;

export const DEFAULT_SETTINGS = {
  privacyMode: false,
  notificationsEnabled: false,
  notificationShowSubjects: false,
  collapseZeroUnread: true,
  displayMailCount: 20,
  mailSortOrder: 'desc',
  mailFilter: 'all',
  mailSearchText: '',
  accountView: 'all',
  timeRange: 'all',
  showBodyPreview: true,
  compactMode: false,
  bodyPreviewMode: 'full',
  bodyPreviewPercent: 60,
  openQqMailMode: 'smallWindow',
  popupWidth: 760,
  popupHeight: 820,
  panelWidth: 760,
  panelHeight: 820,
  fontSize: 'xlarge',
  theme: 'default',
  reuseQqMailWindow: true,
  mailDividerThickness: 1,
  mailDividerStyle: 'solid',
  optimizedDefaultsApplied: true
};
