import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const en = {
  appName: "Vwelfare Connect", langBtn: "عربي", signOut: "Sign out", cancel: "Cancel", close: "Close", save: "Save", back: "Back", loading: "Loading…",
  // sign-in
  staffSignIn: "Staff sign-in", patientSignIn: "Sign in", email: "Work email", username: "Username", password: "Password", confirmPw: "Confirm password",
  signIn: "Sign in", pwHint: "At least 8 characters.", forgotPatient: "Forgot your password? Contact the center to reset it.",
  staffLink: "Staff sign-in", patientLink: "Patient sign-in",
  mfaTitle: "Enter your sign-in code", mfaBody: "Open your authenticator app and enter the 6-digit code for Vwelfare Connect.", code: "6-digit code", verify: "Verify",
  mfaSetupTitle: "Set up your sign-in app", mfaSetupBody: "Scan this code with an authenticator app (such as Microsoft or Google Authenticator), then enter the 6-digit code it shows.",
  mfaManual: "Can't scan? Enter this key instead:",
  staffInviteTitle: "Set your password", staffInviteBody: "Choose a password for {email}. Next you'll set up an authenticator app.", setPassword: "Set password",
  pwSet: "Password set. Sign in to continue.",
  inviteTitle: "Create your account", inviteBody: "{provider} invited you to message your care team at Vwelfare securely. You only need to do this once.",
  inviteBodyNoName: "You're invited to message your care team at Vwelfare securely. You only need to do this once.",
  usernameHint: "4–40 letters, numbers, dots, dashes or underscores.",
  consentText: "I understand that my messages and files are saved to my medical file at Vwelfare, that this chat is not for emergencies, and that replies can take up to one working day.",
  createAccount: "Create account", errPwMatch: "Passwords must match and be at least 8 characters long.", errConsent: "Tick the box to agree before continuing.",
  // shared chat
  tabCurrent: "Current chat", tabPast: "Past chats", send: "Send", attach: "Attach a file", you: "You", sent: "Sent",
  typeMsg: "Write a message", writeTo: "Write to {name}",
  convStarted: "New conversation started by {name}", autoReply: "Outside working hours. Your message will be read on the next working day. In an emergency, use Need urgent help.",
  composerNotePt: "Replies within 1 working day · Saved to your medical file", composerNotePv: "Saved to the patient's EMR file when you finish the chat",
  view: "View", noPast: "No past chats yet.", msgsFiles: "{m} messages · {f} files", retry: "Try again",
  readOnly: "Read only. Downloading, copying and printing are turned off.", hiddenAway: "Hidden while this window isn't active",
  pdfPage: "Page {n}", pdfMorePages: "Showing the first pages. {n} more are kept in the medical record.", fileOpenFailed: "This file couldn't be opened here. It is kept in the medical record.",
  fileInEmrOnly: "Word files can't be shown here. The file is kept in the medical record.",
  riskPill: "Risk words",
  // provider
  myPatients: "My patients", addPatient: "Add patient", noPatients: "No patients yet. Add one with their EMR file number.", fileLabel: "File {n}",
  newMsg: "New message", chatOpen: "Chat open", awaiting: "Invitation sent", waitSync: "Waiting for EMR", pickPatient: "Choose a patient to open the conversation.",
  visits: "Visits", startChat: "Start a chat", noOpenProv: "No open chat with {name}. Start one, or wait for the patient to write.",
  started: "Started {t}", autoIn: "auto-finishes in {d} if there are no new messages", finishChat: "Finish chat",
  riskNote: "This chat contains words that may signal risk. Follow the clinical risk protocol.",
  invitedNote: "{name} hasn't created an account yet. The invitation went to {mobile}. You can chat once they sign up.",
  lockedNote: "The previous chat is finished and locked. It is removed from the platform as soon as the EMR confirms it was saved.",
  addPatientTitle: "Add a patient", addPatientSub: "Enter the patient's EMR file number. The platform reads only their name and visit dates.",
  fileNo: "File number", lookup: "Look up", fromEmr: "From the EMR", name: "Name", visitDates: "Visit dates",
  mobileLabel: "Mobile number for the one-time invitation", mobileHint: "Used to send the invitation link, and later for password reset codes.",
  createPatient: "Create profile and send invitation", alreadyMine: "{name} is already in your patient list.", openPatient: "Open patient",
  alreadyOnPlatform: "{name} already has an account. They'll get a request in the app, and you'll join their care team when they accept.",
  linkPatient: "Send request", patientInvited: "Invitation sent to {name}", patientLinked: "{name} added to your patients",
  finishQ: "Finish this chat and send it to the EMR?",
  finishBody: "It will be saved to file {file} as {rec}, with every message and file. After the EMR confirms, the chat is locked and deleted from this platform.",
  finishGo: "Finish and send to EMR", keepChatting: "Keep chatting", finishing: "Sending to the EMR…",
  finishedSaved: "Saved to the EMR as {rec} and deleted from the platform.",
  finishedQueued: "The EMR didn't respond. The chat stays locked and is sent automatically when the connection returns.",
  pastMine: "Your chats with {name}", pastOthers: "Chats with other providers",
  othersLocked: "Listed only. Reading them needs {name}'s consent.", askConsent: "Ask the patient for access",
  consentPending: "Request sent. Waiting for the patient to answer.", consentGranted: "The patient allowed you to read these chats.",
  consentDenied: "The patient declined. You can ask again later.", consentWithdrawn: "The patient withdrew access. You can ask again.", askAgain: "Ask again",
  // patient
  hello: "Hello, {name}", careTeam: "My care team", noTeam: "You have no active providers right now. Please contact the center.",
  urgentHelp: "Need urgent help?", urgentShort: "Urgent help", helpTitle: "Urgent help",
  helpBody: "This chat isn't monitored around the clock. If you are in danger or thinking about harming yourself, call now.",
  emServices: "Emergency services", crisisLine: "Vwelfare crisis line", call: "Call",
  noNumbers: "Call your local emergency number now.", callHint: "If calling from this screen doesn't work, dial the number shown.",
  afterHoursTitle: "Your care team is outside working hours", afterHoursBody: "Messages are read on the next working day. If you need help now, call:",
  riskTitle: "You don't have to wait for a reply", riskBody: "If you are thinking about harming yourself, please call now:",
  newConvHint: "No open conversation with {name}. Sending a message starts a new one.",
  linkPending: "Waiting for the patient", linkDeclined: "Request declined",
  linkPendingNote: "This patient hasn't accepted you as a provider yet. You can open their file and chat once they accept.",
  linkDeclinedNote: "The patient declined your request to join their care team. You can ask again 7 days after they declined.",
  requestSent: "Request sent. {name} will see it in the app.", requestPending: "You've already asked to join {name}'s care team. Waiting for their answer.",
  teamReqTitle: "Care team request", teamReqBody: "{provider} ({specialty}) asked to join your care team. If you accept, you can message each other here. If you decline, nothing changes.", accept: "Accept",
  reqTitle: "Access request", reqBody: "{provider} is asking to read your past chats with your other providers. Right now they can see only the list of dates, not what was said.",
  allow: "Allow", decline: "Decline", granted: "{provider} can read your past chats with your other providers.", withdraw: "Withdraw access",
  pastWith: "Your past chats with {name}",
  // admin
  adminTabOverview: "Providers and rules", adminTabSecrets: "APIs and services",
  provTitle: "Providers", provSub: "Create an account for each provider. Providers then add their own patients by file number.",
  addProvider: "Add provider", nameEn: "Name (English)", nameAr: "Name (Arabic)", specEn: "Specialty (English)", specAr: "Specialty (Arabic)",
  emrStaffId: "EMR staff ID", createProvider: "Create and send invitation", provInvited: "Invitation sent to {email}",
  colName: "Name", colSpec: "Specialty", colPatients: "Patients", colOpen: "Open chats", colStatus: "Status",
  active: "Active", deactivated: "Deactivated", setupPending: "Set-up pending", deactivate: "Deactivate", reactivate: "Reactivate",
  deactQ: "Deactivate {name}?", deactBody: "{name} is signed out and loses access at once. Their open chats ({n}) are finished and saved to the EMR, and {p} patients will no longer see them in their care team.",
  deactDone: "{name} deactivated. {n} open chats sent to the EMR.",
  rulesTitle: "Chat rules", ruleRemind: "Remind the provider to finish an open chat after", ruleAuto: "Finish a chat automatically after no messages for", hoursUnit: "hours",
  ruleEmergency: "Emergency numbers shown to patients", required: "Required before launch", numberPh: "Add number",
  workingHours: "Working hours", workingDays: "Working days", from: "From", to: "To",
  ruleFiles: "Files that can be shared", ruleFilesVal: "PDF, JPG, PNG, DOCX, M4A · up to 10 MB each", filesNote: "Set by your IT team",
  ruleKeep: "Kept on the platform after the EMR confirms a chat", ruleKeepVal: "Nothing", saveRules: "Save chat rules", rulesSaved: "Chat rules saved",
  auditTitle: "Audit log", auditSub: "Who did what, and when. Message content never appears here.",
  auditSearch: "Search by name, file number or record", whoAll: "Everyone", whoAdmin: "Super admin", whoProviders: "Providers", whoPatients: "Patients", whoPlatform: "Platform",
  auditNone: "No entries match.", patientN: "Patient {n}",
  syncTitle: "Chats waiting for the EMR", syncSub: "Finished chats stay locked here until the EMR confirms it saved them. Only record names are shown.",
  syncNone: "No chats are waiting. Every finished chat has been saved to the EMR.",
  colRecord: "Record", colFinished: "Finished", colAttempts: "Attempts", colNext: "Next try",
  syncSending: "Sending", syncWaiting: "EMR not responding", syncOff: "EMR connection turned off", syncRefused: "EMR refused it", syncFailed: "Couldn't send",
  syncRefusedHelp: "When the EMR refuses a chat, it is tried again every 6 hours. Ask the EMR vendor why, then use Try again now.",
  retryNow: "Try again now", retryQueued: "{rec} will be sent again within a few seconds.",
  days: "Sun,Mon,Tue,Wed,Thu,Fri,Sat",
  // errors by code
  err_bad_credentials: "The sign-in details are incorrect.", err_locked: "Too many attempts. Try again in 15 minutes.",
  err_bad_code: "That code didn't match. Check your authenticator app and try again.", err_emr_unavailable: "The EMR isn't responding right now. Try again in a moment.", err_emr_off: "The connection to the medical record is paused by an administrator. Try again later.",
  err_not_in_emr: "No patient with that file number in the EMR. Check the number and try again.", err_file_type: "This file can't be shared. Use PDF, JPG, PNG, DOCX or M4A, up to 10 MB.",
  err_username_taken: "That username is taken. Choose another.", err_invitation_invalid: "This invitation link has expired or was already used. Ask the center for a new one.",
  err_email_taken: "A provider with this email already exists.", err_bad_mobile: "Enter a mobile number with at least 8 digits.",
  err_FST_REQ_FILE_TOO_LARGE: "This file is larger than 10 MB.", err_generic: "Something went wrong. Try again.",
  err_retry_soon: "This chat is being sent now or will be tried again within 2 minutes.",
  err_code_used: "That code was already used. Wait for the next code in your authenticator app and enter it.",
  err_link_declined: "The patient declined this request recently. You can ask again 7 days after they declined.",
  err_already_open: "A chat with this patient is already open. Reload the page to see it.",
  err_chat_locked: "This chat was finished, so it can't take new messages. Start a new chat to continue.",
  err_consent_required: "The patient hasn't allowed you to read this chat. Ask for their consent first.",
  err_file_rejected: "This file was blocked by the virus scan. Check the file or choose another one.",
  err_file_mismatch: "This file isn't what its name says. Save it again as PDF, JPG, PNG, DOCX or M4A and try again.",
  err_file_too_large: "This file is larger than 10 MB. Choose a smaller file.",
  err_forbidden: "Your account can't open this.",
  err_missing_header: "The request didn't come from the Vwelfare Connect app. Reload the page and try again.",
  err_mfa_already_set_up: "Your authenticator app is already set up. Sign in with a code from it.",
  err_mfa_not_set_up: "Your authenticator app isn't set up yet. Sign in again to set it up.",
  err_no_file: "Choose a file to attach.",
  err_no_open_chat: "There's no open chat with this patient. Start one to send a message.",
  err_no_pending_request: "This request was already answered or withdrawn.",
  err_not_found: "This couldn't be found. It may have been removed.",
  err_not_signed_in: "You're signed out. Sign in again to continue.",
  err_not_your_patient: "This patient isn't in your list.",
  err_not_your_provider: "This provider isn't on your care team.",
  err_patient_not_active: "The patient hasn't created their account yet. You can chat once they have.",
  err_rate_limited: "Too many requests in a short time. Wait a minute and try again.",
  err_server_error: "Something went wrong on the server. Try again in a moment. If it keeps happening, contact the center.",
  err_invalid_input: "Some details aren't in the right format. Check them and try again.",
  err_invalid_username: "Use 4–40 letters, numbers, dots, dashes or underscores for the username.",
  err_invalid_password: "Use at least 8 characters for the password.",
  err_invalid_fileNumber: "Enter a file number of 3 to 12 digits.",
  err_invalid_email: "Enter a full email address, like name@example.com.",
  err_invalid_code: "Enter the 6-digit code from your authenticator app.",
  // admin: reports
  adminTabReports: "Reports", repTitle: "Reports",
  repSub: "Counts only, from account records and the activity log. Chat content is never counted or stored here.",
  repRange: "{from} to {to}", repDownload: "Download CSV",
  repChatsSaved: "Chats saved to the EMR", repStarted: "Chats started", repStartedSplit: "{p} by patients · {v} by providers",
  repFirstReply: "Time to first reply", repFirstReplySub: "Median {m} · 9 in 10 within {p}", repNoData: "No data yet",
  repInvites: "Invitations sent", repAccounts: "{n} accounts created",
  repAfterHours: "Chats with after-hours messages", repAuto: "Finished automatically",
  repRisk: "Risk-word flags", repEmr: "EMR delays and refusals", repEmrSplit: "{d} delayed · {r} refused",
  repPatients: "Patient accounts now", repWeeks: "Chats by week", repWeekOf: "Week of {d}",
  repProviders: "Providers", colSaved: "Saved", colMedianReply: "Median first reply",
  repNote: "Reply times and after-hours counts start from chats saved after this update.",
  mins: "{n} min",
  // admin: needs attention
  attTitle: "Needs attention", attNone: "Nothing needs attention right now.",
  attInvitesExpired: "Patient invitation links that no longer work", attProvidersNotSetUp: "Providers whose set-up link expired",
  attLocked: "Locked accounts", attNoProvider: "Patients with no active provider",
  attUnanswered: "Care-team requests unanswered for more than 7 days", attStuck: "Chats not yet saved to the EMR",
  attStuckHint: "Details are in the list of chats waiting for the EMR, further down this page.",
  // admin: provider profiles
  editDetails: "Details", saveDetails: "Save details", provSaved: "Details saved for {name}.",
  resetSignIn: "Reset sign-in", resetQ: "Reset {name}'s sign-in?",
  resetBody: "The password and authenticator stop working at once, and the account is signed out. A new set-up link goes to {email}. Use this when a phone is lost or a password is forgotten.",
  resetDone: "Sign-in reset. A new set-up link went to {email}.",
  provPatientsTitle: "Patients", provPatientsNone: "No patients yet.", cancelRequest: "Cancel request", requestCancelled: "Request for file {n} cancelled.",
  handoverTitle: "Hand over patients", handoverSub: "Each patient of {name} gets a request to add the provider you choose. The new provider joins the care team only when the patient accepts.",
  handoverTo: "New provider", handoverGo: "Send requests", chooseProvider: "Choose a provider",
  handoverDone: "{r} requests sent. {a} patients already had this provider or a waiting request. {s} deactivated patients skipped.",
  err_bad_handover: "Choose another active provider.",
  // admin: patients
  adminTabPatients: "Patients", ptTitle: "Patients",
  ptSub: "Every patient account on the platform, by EMR file number. Names and visit dates stay in the EMR.",
  ptSearch: "Search by file number", ptAllStatus: "All statuses", ptInvited: "Invitation sent", ptActive: "Active", ptDeactivated: "Deactivated", ptLocked: "Locked",
  ptAllProviders: "All providers", colFile: "File number", colTeam: "Care team", colLastIn: "Last sign-in", colJoined: "Added",
  ptPendingN: "+{n} waiting", ptNever: "Not yet", ptNone: "No patients match these filters.", ptNoneYet: "No patients yet. Providers add patients by their EMR file number.",
  manage: "Manage", ptDlgTitle: "File {n}", ptMobile: "Mobile number", ptMobileEnd: "Ends in {d}", ptTerms: "Accepted the terms",
  ptInvite: "Invitation", ptInviteState: "Sent {sent} · works until {exp}", ptInviteUsed: "Used {t}", ptInviteEnded: "No longer works (since {t})",
  ptTeamTitle: "Care team", ptTeamEmpty: "No providers yet.", linkAccepted: "In care team",
  ptActivity: "Recent activity", ptActivityNone: "No activity yet.",
  resendInvite: "Send a new invitation", newMobileOpt: "New mobile number (only if the old one was wrong)",
  resent: "New invitation sent for file {n}. The earlier link no longer works.", provResent: "New invitation sent to {email}. The earlier link no longer works.",
  cancelInvite: "Cancel the invitation link", inviteCancelled: "The invitation link for file {n} no longer works.",
  unlock: "Unlock", unlocked: "Unlocked. Signing in works again now.",
  ptDeactQ: "Deactivate file {n}?",
  ptDeactBody: "The patient is signed out and can't sign in or get messages. Open chats ({c}) are finished and saved to the EMR. The care team and the past chats in the EMR are kept, and you can reactivate the account later.",
  ptDeactDone: "File {n} deactivated. {c} open chats sent to the EMR.", ptReactDone: "File {n} reactivated.",
  ptReactInvited: "File {n} reactivated. No account was created before, so send a new invitation.",
  ptDeactivatedNote: "{name}'s account is deactivated, so chatting is paused. Past chats are still in the Past chats tab. Contact the center's admin if this is a mistake.",
  err_patient_deactivated: "This patient's account is deactivated. Ask the center's admin to reactivate it.",
  err_already_set_up: "This account is already set up, so there's no invitation to send.",
  err_account_deactivated: "Reactivate this account first, then send the invitation.",
  err_no_open_invite: "There's no invitation link waiting to be used.",
  kb: "KB", mb: "MB", hm: "{h}h {m}m"
};

type Key = keyof typeof en;

const ar: Record<Key, string> = {
  appName: "Vwelfare Connect", langBtn: "English", signOut: "تسجيل الخروج", cancel: "إلغاء", close: "إغلاق", save: "حفظ", back: "رجوع", loading: "جارٍ التحميل…",
  staffSignIn: "دخول الموظفين", patientSignIn: "تسجيل الدخول", email: "البريد الإلكتروني للعمل", username: "اسم المستخدم", password: "كلمة المرور", confirmPw: "تأكيد كلمة المرور",
  signIn: "دخول", pwHint: "8 أحرف على الأقل.", forgotPatient: "نسيت كلمة المرور؟ تواصل مع المركز لإعادة تعيينها.",
  staffLink: "دخول الموظفين", patientLink: "دخول المرضى",
  mfaTitle: "أدخل رمز الدخول", mfaBody: "افتح تطبيق المصادقة وأدخل الرمز المكوّن من 6 أرقام الخاص بـ Vwelfare Connect.", code: "رمز من 6 أرقام", verify: "تحقق",
  mfaSetupTitle: "إعداد تطبيق الدخول", mfaSetupBody: "امسح هذا الرمز بتطبيق مصادقة (مثل Microsoft أو Google Authenticator)، ثم أدخل الرمز المكوّن من 6 أرقام الذي يظهر.",
  mfaManual: "لا يمكنك المسح؟ أدخل هذا المفتاح:",
  staffInviteTitle: "عيّن كلمة المرور", staffInviteBody: "اختر كلمة مرور للحساب {email}. بعد ذلك ستُعدّ تطبيق المصادقة.", setPassword: "تعيين كلمة المرور",
  pwSet: "تم تعيين كلمة المرور. سجّل الدخول للمتابعة.",
  inviteTitle: "أنشئ حسابك", inviteBody: "وصلتك دعوة من {provider} للتواصل مع فريق رعايتك في Vwelfare بأمان. تحتاج إلى هذه الخطوة مرة واحدة فقط.",
  inviteBodyNoName: "وصلتك دعوة للتواصل مع فريق رعايتك في Vwelfare بأمان. تحتاج إلى هذه الخطوة مرة واحدة فقط.",
  usernameHint: "من 4 إلى 40 حرفاً إنجليزياً أو رقماً أو نقطة أو شرطة.",
  consentText: "أفهم أن رسائلي وملفاتي تُحفظ في ملفي الطبي لدى Vwelfare، وأن هذه المحادثة ليست للحالات الطارئة، وأن الرد قد يستغرق حتى يوم عمل واحد.",
  createAccount: "إنشاء الحساب", errPwMatch: "يجب أن تتطابق كلمتا المرور وأن تتكون من 8 أحرف على الأقل.", errConsent: "ضع علامة في المربع للموافقة قبل المتابعة.",
  tabCurrent: "المحادثة الحالية", tabPast: "المحادثات السابقة", send: "إرسال", attach: "إرفاق ملف", you: "أنت", sent: "أُرسلت",
  typeMsg: "اكتب رسالة", writeTo: "اكتب إلى {name}",
  convStarted: "بداية محادثة جديدة من {name}", autoReply: "خارج ساعات العمل. ستُقرأ رسالتك في يوم العمل التالي. في حالة الطوارئ، استخدم «تحتاج مساعدة عاجلة؟».",
  composerNotePt: "الرد خلال يوم عمل واحد · تُحفظ في ملفك الطبي", composerNotePv: "تُحفظ في ملف المريض بالسجل الطبي عند إنهاء المحادثة",
  view: "عرض", noPast: "لا توجد محادثات سابقة بعد.", msgsFiles: "{m} رسائل · {f} ملفات", retry: "حاول مرة أخرى",
  readOnly: "للقراءة فقط. التنزيل والنسخ والطباعة معطّلة.", hiddenAway: "المحتوى مخفي عندما لا تكون هذه النافذة نشطة",
  pdfPage: "الصفحة {n}", pdfMorePages: "تظهر هنا الصفحات الأولى فقط. الصفحات المتبقية ({n}) محفوظة في السجل الطبي.", fileOpenFailed: "تعذّر فتح هذا الملف هنا. الملف محفوظ في السجل الطبي.",
  fileInEmrOnly: "لا يمكن عرض ملفات Word هنا. الملف محفوظ في السجل الطبي.",
  riskPill: "كلمات خطر",
  myPatients: "مرضاي", addPatient: "إضافة مريض", noPatients: "لا يوجد مرضى بعد. أضف مريضاً برقم ملفه في السجل الطبي.", fileLabel: "ملف {n}",
  newMsg: "رسالة جديدة", chatOpen: "محادثة مفتوحة", awaiting: "تم إرسال الدعوة", waitSync: "بانتظار السجل الطبي", pickPatient: "اختر مريضاً لفتح المحادثة.",
  visits: "الزيارات", startChat: "بدء محادثة", noOpenProv: "لا توجد محادثة مفتوحة مع {name}. ابدأ محادثة أو انتظر حتى يكتب المريض.",
  started: "بدأت {t}", autoIn: "تنتهي تلقائياً خلال {d} إذا لم تصل رسائل جديدة", finishChat: "إنهاء المحادثة",
  riskNote: "تحتوي هذه المحادثة على كلمات قد تشير إلى خطر. اتبع بروتوكول تقييم الخطر السريري.",
  invitedNote: "لم يُنشأ حساب {name} بعد. أُرسلت الدعوة إلى {mobile}. يمكنك بدء المحادثة بعد التسجيل.",
  lockedNote: "انتهت المحادثة السابقة وأُقفلت. تُحذف من المنصة فور تأكيد السجل الطبي حفظها.",
  addPatientTitle: "إضافة مريض", addPatientSub: "أدخل رقم ملف المريض في السجل الطبي. تقرأ المنصة الاسم وتواريخ الزيارات فقط.",
  fileNo: "رقم الملف", lookup: "بحث", fromEmr: "من السجل الطبي", name: "الاسم", visitDates: "تواريخ الزيارات",
  mobileLabel: "رقم الجوال لإرسال الدعوة لمرة واحدة", mobileHint: "يُستخدم لإرسال رابط الدعوة، ولاحقاً لرموز إعادة تعيين كلمة المرور.",
  createPatient: "إنشاء الملف وإرسال الدعوة", alreadyMine: "{name} ضمن قائمة مرضاك بالفعل.", openPatient: "فتح ملف المريض",
  alreadyOnPlatform: "لدى {name} حساب بالفعل. سيظهر الطلب في التطبيق، ويتم الانضمام إلى فريق الرعاية بعد الموافقة عليه.",
  linkPatient: "إرسال الطلب", patientInvited: "تم إرسال الدعوة إلى {name}", patientLinked: "تمت إضافة {name} إلى مرضاك",
  finishQ: "إنهاء هذه المحادثة وإرسالها إلى السجل الطبي؟",
  finishBody: "ستُحفظ في الملف {file} باسم {rec} مع جميع الرسائل والملفات. بعد تأكيد السجل الطبي تُقفل المحادثة وتُحذف من هذه المنصة.",
  finishGo: "إنهاء وإرسال إلى السجل الطبي", keepChatting: "متابعة المحادثة", finishing: "جارٍ الإرسال إلى السجل الطبي…",
  finishedSaved: "حُفظت في السجل الطبي باسم {rec} وحُذفت من المنصة.",
  finishedQueued: "لم يستجب السجل الطبي. تبقى المحادثة مقفلة وتُرسل تلقائياً عند عودة الاتصال.",
  pastMine: "محادثاتك مع {name}", pastOthers: "محادثات مع مقدمي رعاية آخرين",
  othersLocked: "تظهر في القائمة فقط. قراءتها تتطلب موافقة {name}.", askConsent: "طلب إذن المريض",
  consentPending: "تم إرسال الطلب. بانتظار رد المريض.", consentGranted: "سمح لك المريض بقراءة هذه المحادثات.",
  consentDenied: "رفض المريض الطلب. يمكنك الطلب مرة أخرى لاحقاً.", consentWithdrawn: "سحب المريض الإذن. يمكنك الطلب مرة أخرى.", askAgain: "الطلب مرة أخرى",
  hello: "مرحباً، {name}", careTeam: "فريق رعايتي", noTeam: "لا يوجد مقدمو رعاية نشطون حالياً. يرجى التواصل مع المركز.",
  urgentHelp: "تحتاج مساعدة عاجلة؟", urgentShort: "مساعدة عاجلة", helpTitle: "مساعدة عاجلة",
  helpBody: "هذه المحادثة غير مراقبة على مدار الساعة. إذا كنت في خطر أو تفكر في إيذاء نفسك، اتصل الآن.",
  emServices: "خدمات الطوارئ", crisisLine: "خط الأزمات في Vwelfare", call: "اتصال",
  noNumbers: "يُرجى الاتصال برقم الطوارئ في بلدك الآن.", callHint: "إذا لم يعمل الاتصال من هذه الشاشة، اطلب الرقم الظاهر.",
  afterHoursTitle: "فريق رعايتك خارج ساعات العمل", afterHoursBody: "تُقرأ الرسائل في يوم العمل التالي. إذا كنت تحتاج مساعدة الآن، اتصل بـ:",
  riskTitle: "لا داعي لانتظار الرد", riskBody: "إذا كنت تفكر في إيذاء نفسك، اتصل الآن من فضلك:",
  newConvHint: "لا توجد محادثة مفتوحة مع {name}. إرسال رسالة يبدأ محادثة جديدة.",
  linkPending: "بانتظار موافقة المريض", linkDeclined: "تم رفض الطلب",
  linkPendingNote: "لم تتم الموافقة على الانضمام إلى فريق رعاية هذا المريض بعد. يمكن فتح الملف وبدء المحادثة بعد الموافقة.",
  linkDeclinedNote: "تم رفض طلب الانضمام إلى فريق الرعاية. يمكن إرسال الطلب مرة أخرى بعد 7 أيام من الرفض.",
  requestSent: "أُرسل الطلب. سيظهر لـ {name} في التطبيق.", requestPending: "طلب الانضمام إلى فريق رعاية {name} مُرسل بالفعل، بانتظار الرد.",
  teamReqTitle: "طلب انضمام إلى فريق الرعاية", teamReqBody: "طلب من {provider} ({specialty}) للانضمام إلى فريق رعايتك. عند القبول تصبح المراسلة ممكنة هنا، وعند الرفض لا يتغير شيء.", accept: "قبول",
  reqTitle: "طلب وصول", reqBody: "طلب من {provider} لقراءة محادثاتك السابقة مع مقدمي الرعاية الآخرين. المتاح حالياً هو قائمة التواريخ فقط، دون محتوى المحادثات.",
  allow: "سماح", decline: "رفض", granted: "مسموح لـ {provider} بقراءة محادثاتك السابقة مع مقدمي الرعاية الآخرين.", withdraw: "سحب الإذن",
  pastWith: "محادثاتك السابقة مع {name}",
  adminTabOverview: "مقدمو الرعاية والقواعد", adminTabSecrets: "الواجهات والخدمات",
  provTitle: "مقدمو الرعاية", provSub: "أنشئ حساباً لكل مقدم رعاية، ثم يضيف كل منهم مرضاه برقم الملف.",
  addProvider: "إضافة مقدم رعاية", nameEn: "الاسم (بالإنجليزية)", nameAr: "الاسم (بالعربية)", specEn: "التخصص (بالإنجليزية)", specAr: "التخصص (بالعربية)",
  emrStaffId: "رقم الموظف في السجل الطبي", createProvider: "إنشاء الحساب وإرسال الدعوة", provInvited: "تم إرسال الدعوة إلى {email}",
  colName: "الاسم", colSpec: "التخصص", colPatients: "المرضى", colOpen: "محادثات مفتوحة", colStatus: "الحالة",
  active: "نشط", deactivated: "معطّل", setupPending: "بانتظار الإعداد", deactivate: "تعطيل", reactivate: "إعادة التفعيل",
  deactQ: "تعطيل حساب {name}؟", deactBody: "يُسجَّل الخروج من حساب {name} ويتوقف الوصول فوراً. تُنهى المحادثات المفتوحة ({n}) وتُحفظ في السجل الطبي، ولن يظهر الحساب بعد الآن في فريق رعاية {p} مرضى.",
  deactDone: "تم تعطيل حساب {name}. أُرسلت {n} محادثات مفتوحة إلى السجل الطبي.",
  rulesTitle: "قواعد المحادثة", ruleRemind: "تذكير مقدم الرعاية بإنهاء المحادثة المفتوحة بعد", ruleAuto: "إنهاء المحادثة تلقائياً عند عدم وجود رسائل لمدة", hoursUnit: "ساعة",
  ruleEmergency: "أرقام الطوارئ التي تظهر للمرضى", required: "مطلوب قبل الإطلاق", numberPh: "أضف الرقم",
  workingHours: "ساعات العمل", workingDays: "أيام العمل", from: "من", to: "إلى",
  ruleFiles: "الملفات التي يمكن مشاركتها", ruleFilesVal: "PDF، JPG، PNG، DOCX، M4A · حتى 10 ميجابايت لكل ملف", filesNote: "يحددها فريق تقنية المعلومات",
  ruleKeep: "ما يبقى على المنصة بعد تأكيد السجل الطبي", ruleKeepVal: "لا شيء", saveRules: "حفظ قواعد المحادثة", rulesSaved: "تم حفظ قواعد المحادثة",
  auditTitle: "سجل التدقيق", auditSub: "من فعل ماذا ومتى. لا يظهر محتوى الرسائل هنا أبداً.",
  auditSearch: "ابحث بالاسم أو رقم الملف أو السجل", whoAll: "الجميع", whoAdmin: "المشرف العام", whoProviders: "مقدمو الرعاية", whoPatients: "المرضى", whoPlatform: "المنصة",
  auditNone: "لا توجد نتائج مطابقة.", patientN: "المريض {n}",
  syncTitle: "محادثات بانتظار السجل الطبي", syncSub: "تبقى المحادثات المنتهية مقفلة هنا حتى يؤكد السجل الطبي حفظها. تظهر أسماء السجلات فقط.",
  syncNone: "لا توجد محادثات بالانتظار. حُفظت كل المحادثات المنتهية في السجل الطبي.",
  colRecord: "السجل", colFinished: "انتهت", colAttempts: "المحاولات", colNext: "المحاولة التالية",
  syncSending: "جارٍ الإرسال", syncWaiting: "السجل الطبي لا يستجيب", syncOff: "الاتصال بالسجل الطبي متوقف", syncRefused: "رفضها السجل الطبي", syncFailed: "تعذّر الإرسال",
  syncRefusedHelp: "عندما يرفض السجل الطبي محادثة، تُعاد المحاولة كل 6 ساعات. يُرجى سؤال مزوّد السجل الطبي عن السبب، ثم استخدام «إعادة المحاولة الآن».",
  retryNow: "إعادة المحاولة الآن", retryQueued: "سيُعاد إرسال {rec} خلال ثوانٍ.",
  days: "الأحد,الاثنين,الثلاثاء,الأربعاء,الخميس,الجمعة,السبت",
  err_bad_credentials: "بيانات الدخول غير صحيحة.", err_locked: "محاولات كثيرة. حاول مرة أخرى بعد 15 دقيقة.",
  err_bad_code: "الرمز غير مطابق. تحقق من تطبيق المصادقة وحاول مرة أخرى.", err_emr_unavailable: "السجل الطبي لا يستجيب حالياً. حاول مرة أخرى بعد قليل.", err_emr_off: "الاتصال بالسجل الطبي متوقف مؤقتاً من قِبل الإدارة. حاول مرة أخرى لاحقاً.",
  err_not_in_emr: "لا يوجد مريض بهذا الرقم في السجل الطبي. تحقق من الرقم وحاول مرة أخرى.", err_file_type: "لا يمكن مشاركة هذا الملف. استخدم PDF أو JPG أو PNG أو DOCX أو M4A بحجم لا يتجاوز 10 ميجابايت.",
  err_username_taken: "اسم المستخدم مستخدم. اختر اسماً آخر.", err_invitation_invalid: "انتهت صلاحية رابط الدعوة أو استُخدم من قبل. اطلب رابطاً جديداً من المركز.",
  err_email_taken: "يوجد مقدم رعاية بهذا البريد بالفعل.", err_bad_mobile: "أدخل رقم جوال من 8 أرقام على الأقل.",
  err_FST_REQ_FILE_TOO_LARGE: "حجم الملف أكبر من 10 ميجابايت.", err_generic: "حدث خطأ. حاول مرة أخرى.",
  err_retry_soon: "يجري إرسال هذه المحادثة الآن أو ستُعاد المحاولة خلال دقيقتين.",
  err_code_used: "استُخدم هذا الرمز من قبل. يُرجى انتظار الرمز التالي في تطبيق المصادقة وإدخاله.",
  err_link_declined: "تم رفض هذا الطلب مؤخراً. يمكن إرسال الطلب مرة أخرى بعد 7 أيام من الرفض.",
  err_already_open: "توجد محادثة مفتوحة بالفعل مع هذا المريض. يُرجى إعادة تحميل الصفحة لعرضها.",
  err_chat_locked: "انتهت هذه المحادثة ولا تقبل رسائل جديدة. يُرجى بدء محادثة جديدة للمتابعة.",
  err_consent_required: "لا يوجد إذن من المريض لقراءة هذه المحادثة. يُرجى طلب الموافقة أولاً.",
  err_file_rejected: "حُظر هذا الملف في فحص الفيروسات. يُرجى التحقق من الملف أو اختيار ملف آخر.",
  err_file_mismatch: "محتوى هذا الملف لا يطابق اسمه. يُرجى حفظه مجددًا بصيغة PDF أو JPG أو PNG أو DOCX أو M4A ثم المحاولة مرة أخرى.",
  err_file_too_large: "حجم هذا الملف أكبر من 10 ميجابايت. يُرجى اختيار ملف أصغر.",
  err_forbidden: "لا يمكن فتح هذا بهذا الحساب.",
  err_missing_header: "لم يصدر الطلب من تطبيق Vwelfare Connect. يُرجى إعادة تحميل الصفحة والمحاولة مرة أخرى.",
  err_mfa_already_set_up: "تطبيق المصادقة مُعدّ بالفعل. يُرجى تسجيل الدخول برمز منه.",
  err_mfa_not_set_up: "لم يُعدّ تطبيق المصادقة بعد. يُرجى تسجيل الدخول مرة أخرى لإعداده.",
  err_no_file: "يُرجى اختيار ملف لإرفاقه.",
  err_no_open_chat: "لا توجد محادثة مفتوحة مع هذا المريض. يُرجى بدء محادثة لإرسال رسالة.",
  err_no_pending_request: "تمت الإجابة عن هذا الطلب أو سُحب من قبل.",
  err_not_found: "تعذّر العثور على هذا. ربما أُزيل.",
  err_not_signed_in: "انتهت جلسة الدخول. يُرجى تسجيل الدخول مرة أخرى للمتابعة.",
  err_not_your_patient: "هذا المريض ليس في قائمتك.",
  err_not_your_provider: "مقدم الرعاية هذا ليس ضمن فريق رعايتك.",
  err_patient_not_active: "لم يُنشأ حساب المريض بعد. يمكن بدء المحادثة بعد إنشائه.",
  err_rate_limited: "طلبات كثيرة في وقت قصير. يُرجى الانتظار دقيقة ثم المحاولة مرة أخرى.",
  err_server_error: "حدث خطأ في الخادم. يُرجى المحاولة بعد قليل، وإذا تكرر ذلك يُرجى التواصل مع المركز.",
  err_invalid_input: "بعض البيانات ليست بالصيغة الصحيحة. يُرجى مراجعتها والمحاولة مرة أخرى.",
  err_invalid_username: "يجب أن يتكون اسم المستخدم من 4 إلى 40 حرفاً إنجليزياً أو رقماً أو نقطة أو شرطة أو شرطة سفلية.",
  err_invalid_password: "يجب ألا تقل كلمة المرور عن 8 أحرف.",
  err_invalid_fileNumber: "يُرجى إدخال رقم ملف من 3 إلى 12 رقماً.",
  err_invalid_email: "يُرجى إدخال بريد إلكتروني كامل، مثل name@example.com.",
  err_invalid_code: "يُرجى إدخال الرمز المكوّن من 6 أرقام من تطبيق المصادقة.",
  // admin: reports
  adminTabReports: "التقارير", repTitle: "التقارير",
  repSub: "أعداد فقط، من سجلات الحسابات وسجل النشاط. لا يُحسب محتوى المحادثات ولا يُخزَّن هنا.",
  repRange: "من {from} إلى {to}", repDownload: "تنزيل ملف CSV",
  repChatsSaved: "محادثات حُفظت في السجل الطبي", repStarted: "محادثات بدأت", repStartedSplit: "{p} من المرضى · {v} من مقدمي الرعاية",
  repFirstReply: "وقت أول رد", repFirstReplySub: "الوسيط {m} · 9 من كل 10 خلال {p}", repNoData: "لا توجد بيانات بعد",
  repInvites: "دعوات أُرسلت", repAccounts: "أُنشئت {n} حسابات",
  repAfterHours: "محادثات فيها رسائل خارج ساعات العمل", repAuto: "أُنهيت تلقائياً",
  repRisk: "تنبيهات كلمات الخطر", repEmr: "تأخر السجل الطبي ورفضه", repEmrSplit: "{d} تأخير · {r} رفض",
  repPatients: "حسابات المرضى حالياً", repWeeks: "المحادثات حسب الأسبوع", repWeekOf: "أسبوع {d}",
  repProviders: "مقدمو الرعاية", colSaved: "حُفظت", colMedianReply: "وسيط أول رد",
  repNote: "تبدأ أوقات الرد وأعداد ما بعد ساعات العمل من المحادثات المحفوظة بعد هذا التحديث.",
  mins: "{n} دقيقة",
  // admin: needs attention
  attTitle: "بحاجة إلى متابعة", attNone: "لا يوجد ما يحتاج إلى متابعة الآن.",
  attInvitesExpired: "روابط دعوة مرضى لم تعد تعمل", attProvidersNotSetUp: "مقدمو رعاية انتهى رابط الإعداد الخاص بهم",
  attLocked: "حسابات مقفلة", attNoProvider: "مرضى بلا مقدم رعاية نشط",
  attUnanswered: "طلبات انضمام إلى فريق الرعاية دون رد منذ أكثر من 7 أيام", attStuck: "محادثات لم تُحفظ بعد في السجل الطبي",
  attStuckHint: "التفاصيل في قائمة المحادثات بانتظار السجل الطبي أسفل هذه الصفحة.",
  // admin: provider profiles
  editDetails: "البيانات", saveDetails: "حفظ البيانات", provSaved: "حُفظت بيانات {name}.",
  resetSignIn: "إعادة ضبط تسجيل الدخول", resetQ: "إعادة ضبط تسجيل دخول {name}؟",
  resetBody: "تتوقف كلمة المرور وتطبيق المصادقة فوراً ويُسجَّل الخروج من الحساب. يُرسل رابط إعداد جديد إلى {email}. يُستخدم هذا عند فقدان الهاتف أو نسيان كلمة المرور.",
  resetDone: "أُعيد ضبط تسجيل الدخول. أُرسل رابط إعداد جديد إلى {email}.",
  provPatientsTitle: "المرضى", provPatientsNone: "لا يوجد مرضى بعد.", cancelRequest: "إلغاء الطلب", requestCancelled: "أُلغي الطلب للملف {n}.",
  handoverTitle: "نقل المرضى", handoverSub: "يتلقى كل مريض لدى {name} طلباً لإضافة مقدم الرعاية المختار. لا ينضم مقدم الرعاية الجديد إلى فريق الرعاية إلا بعد موافقة المريض.",
  handoverTo: "مقدم الرعاية الجديد", handoverGo: "إرسال الطلبات", chooseProvider: "اختيار مقدم رعاية",
  handoverDone: "أُرسلت الطلبات ({r}). لدى {a} مرضى مقدم الرعاية هذا أو طلب بانتظار الرد. تم تخطي المرضى المعطَّلين ({s}).",
  err_bad_handover: "يلزم اختيار مقدم رعاية آخر نشط.",
  // admin: patients
  adminTabPatients: "المرضى", ptTitle: "المرضى",
  ptSub: "جميع حسابات المرضى على المنصة حسب رقم الملف في السجل الطبي. تبقى الأسماء وتواريخ الزيارات في السجل الطبي.",
  ptSearch: "البحث برقم الملف", ptAllStatus: "كل الحالات", ptInvited: "أُرسلت الدعوة", ptActive: "نشط", ptDeactivated: "معطَّل", ptLocked: "مقفل",
  ptAllProviders: "كل مقدمي الرعاية", colFile: "رقم الملف", colTeam: "فريق الرعاية", colLastIn: "آخر تسجيل دخول", colJoined: "تاريخ الإضافة",
  ptPendingN: "+{n} بانتظار الرد", ptNever: "ليس بعد", ptNone: "لا يوجد مرضى مطابقون لهذه الفلاتر.", ptNoneYet: "لا يوجد مرضى بعد. يضيف مقدمو الرعاية المرضى برقم الملف في السجل الطبي.",
  manage: "إدارة", ptDlgTitle: "الملف {n}", ptMobile: "رقم الجوال", ptMobileEnd: "ينتهي بـ {d}", ptTerms: "الموافقة على الشروط",
  ptInvite: "الدعوة", ptInviteState: "أُرسلت {sent} · تعمل حتى {exp}", ptInviteUsed: "استُخدمت {t}", ptInviteEnded: "لم تعد تعمل (منذ {t})",
  ptTeamTitle: "فريق الرعاية", ptTeamEmpty: "لا يوجد مقدمو رعاية بعد.", linkAccepted: "ضمن فريق الرعاية",
  ptActivity: "النشاط الأخير", ptActivityNone: "لا يوجد نشاط بعد.",
  resendInvite: "إرسال دعوة جديدة", newMobileOpt: "رقم جوال جديد (فقط إذا كان الرقم السابق خاطئاً)",
  resent: "أُرسلت دعوة جديدة للملف {n}. الرابط السابق لم يعد يعمل.", provResent: "أُرسلت دعوة جديدة إلى {email}. الرابط السابق لم يعد يعمل.",
  cancelInvite: "إلغاء رابط الدعوة", inviteCancelled: "رابط الدعوة للملف {n} لم يعد يعمل.",
  unlock: "إلغاء القفل", unlocked: "أُلغي القفل. يمكن تسجيل الدخول الآن.",
  ptDeactQ: "تعطيل الملف {n}؟",
  ptDeactBody: "يُسجَّل الخروج من حساب المريض ولا يمكن تسجيل الدخول أو استقبال الرسائل. تُنهى المحادثات المفتوحة ({c}) وتُحفظ في السجل الطبي. يبقى فريق الرعاية والمحادثات السابقة في السجل الطبي، ويمكن إعادة تفعيل الحساب لاحقاً.",
  ptDeactDone: "عُطِّل الملف {n}. أُرسلت المحادثات المفتوحة ({c}) إلى السجل الطبي.", ptReactDone: "أُعيد تفعيل الملف {n}.",
  ptReactInvited: "أُعيد تفعيل الملف {n}. لم يُنشأ حساب من قبل، لذا يلزم إرسال دعوة جديدة.",
  ptDeactivatedNote: "حساب {name} معطَّل، لذا المحادثة متوقفة. المحادثات السابقة ما زالت في تبويب المحادثات السابقة. يمكن التواصل مع مشرف المركز إذا كان ذلك خطأ.",
  err_patient_deactivated: "حساب هذا المريض معطَّل. يمكن طلب إعادة تفعيله من مشرف المركز.",
  err_already_set_up: "هذا الحساب مُعدّ مسبقاً، لذا لا توجد دعوة لإرسالها.",
  err_account_deactivated: "يلزم إعادة تفعيل هذا الحساب أولاً، ثم إرسال الدعوة.",
  err_no_open_invite: "لا يوجد رابط دعوة بانتظار الاستخدام.",
  kb: "ك.ب", mb: "م.ب", hm: "{h} س {m} د"
};

export type Lang = "en" | "ar";
export type Bilingual = { en?: string | null; ar?: string | null } | null | undefined;
type Vars = Record<string, string | number>;

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: Key, v?: Vars) => string;
  L: (b: Bilingual) => string;
  fDate: (d: Date | string) => string;
  fTime: (d: Date | string) => string;
  fDT: (d: Date | string) => string;
  fDur: (ms: number) => string;
  fSize: (bytes: number) => string;
  errText: (e: unknown) => string;
};

const I18nContext = createContext<Ctx | null>(null);

function readLang(): Lang {
  try { return localStorage.getItem("vw-lang") === "ar" ? "ar" : "en"; } catch { return "en"; }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const value = useMemo<Ctx>(() => {
    const dict = lang === "ar" ? ar : en;
    const loc = lang === "ar" ? "ar-u-nu-latn" : "en-GB";
    const t = (k: Key, v: Vars = {}) => (dict[k] ?? en[k]).replace(/\{(\w+)\}/g, (m, x) => (v[x] === undefined ? m : String(v[x])));
    const toDate = (d: Date | string) => (typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00" : d) : d);
    const fDate = (d: Date | string) => new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", year: "numeric" }).format(toDate(d));
    const fTime = (d: Date | string) => new Intl.DateTimeFormat(loc, { hour: "2-digit", minute: "2-digit" }).format(toDate(d));
    return {
      lang,
      setLang: l => { setLangState(l); try { localStorage.setItem("vw-lang", l); } catch { /* private mode */ } },
      t,
      L: b => (b ? (lang === "ar" && b.ar) || b.en || "" : ""),
      fDate, fTime,
      fDT: d => `${fDate(d)} · ${fTime(d)}`,
      fDur: ms => { const m = Math.max(0, Math.round(ms / 60000)); return t("hm", { h: Math.floor(m / 60), m: m % 60 }); },
      fSize: b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} ${t("mb")}` : `${Math.max(1, Math.round(b / 1024))} ${t("kb")}`),
      errText: e => {
        const code = (e as { code?: string })?.code;
        const field = (e as { field?: string })?.field;
        const fieldKey = `err_invalid_${field}` as Key;
        if (code === "invalid_input" && field && fieldKey in en) return t(fieldKey);
        const key = `err_${code}` as Key;
        if (code && key in en) return t(key);
        // Untranslated server text is English, so Arabic screens show the general message instead.
        return (lang === "en" && (e as Error)?.message) || t("err_generic");
      }
    };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const c = useContext(I18nContext);
  if (!c) throw new Error("useI18n outside I18nProvider");
  return c;
}
