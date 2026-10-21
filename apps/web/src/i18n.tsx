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
  alreadyOnPlatform: "{name} already has an account. You'll be added as one of their providers. No new invitation is needed.",
  linkPatient: "Add to my patients", patientInvited: "Invitation sent to {name}", patientLinked: "{name} added to your patients",
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
  numberMissing: "Not set yet. The center's admin adds this number before launch.", callHint: "If calling from this screen doesn't work, dial the number shown.",
  afterHoursTitle: "Your care team is outside working hours", afterHoursBody: "Messages are read on the next working day. If you need help now, call:",
  riskTitle: "You don't have to wait for a reply", riskBody: "If you are thinking about harming yourself, please call now:",
  newConvHint: "No open conversation with {name}. Sending a message starts a new one.",
  reqTitle: "Access request", reqBody: "{provider} is asking to read your past chats with your other providers. Right now they can see only the list of dates, not what was said.",
  allow: "Allow", decline: "Decline", granted: "{provider} can read your past chats with your other providers.", withdraw: "Withdraw access",
  pastWith: "Your past chats with {name}",
  // admin
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
  days: "Sun,Mon,Tue,Wed,Thu,Fri,Sat",
  // errors by code
  err_bad_credentials: "The sign-in details are incorrect.", err_locked: "Too many attempts. Try again in 15 minutes.",
  err_bad_code: "That code didn't match. Check your authenticator app and try again.", err_emr_unavailable: "The EMR isn't responding right now. Try again in a moment.",
  err_not_in_emr: "No patient with that file number in the EMR. Check the number and try again.", err_file_type: "This file can't be shared. Use PDF, JPG, PNG, DOCX or M4A, up to 10 MB.",
  err_username_taken: "That username is taken. Choose another.", err_invitation_invalid: "This invitation link has expired or was already used. Ask the center for a new one.",
  err_email_taken: "A provider with this email already exists.", err_bad_mobile: "Enter a mobile number with at least 8 digits.",
  err_FST_REQ_FILE_TOO_LARGE: "This file is larger than 10 MB.", err_generic: "Something went wrong. Try again.",
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
  alreadyOnPlatform: "لدى {name} حساب بالفعل. ستُضاف كأحد مقدمي الرعاية دون الحاجة إلى دعوة جديدة.",
  linkPatient: "إضافة إلى مرضاي", patientInvited: "تم إرسال الدعوة إلى {name}", patientLinked: "تمت إضافة {name} إلى مرضاك",
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
  numberMissing: "لم يُضف بعد. يضيف مشرف المركز هذا الرقم قبل الإطلاق.", callHint: "إذا لم يعمل الاتصال من هذه الشاشة، اطلب الرقم الظاهر.",
  afterHoursTitle: "فريق رعايتك خارج ساعات العمل", afterHoursBody: "تُقرأ الرسائل في يوم العمل التالي. إذا كنت تحتاج مساعدة الآن، اتصل بـ:",
  riskTitle: "لا داعي لانتظار الرد", riskBody: "إذا كنت تفكر في إيذاء نفسك، اتصل الآن من فضلك:",
  newConvHint: "لا توجد محادثة مفتوحة مع {name}. إرسال رسالة يبدأ محادثة جديدة.",
  reqTitle: "طلب وصول", reqBody: "طلب من {provider} لقراءة محادثاتك السابقة مع مقدمي الرعاية الآخرين. المتاح حالياً هو قائمة التواريخ فقط، دون محتوى المحادثات.",
  allow: "سماح", decline: "رفض", granted: "مسموح لـ {provider} بقراءة محادثاتك السابقة مع مقدمي الرعاية الآخرين.", withdraw: "سحب الإذن",
  pastWith: "محادثاتك السابقة مع {name}",
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
  days: "الأحد,الاثنين,الثلاثاء,الأربعاء,الخميس,الجمعة,السبت",
  err_bad_credentials: "بيانات الدخول غير صحيحة.", err_locked: "محاولات كثيرة. حاول مرة أخرى بعد 15 دقيقة.",
  err_bad_code: "الرمز غير مطابق. تحقق من تطبيق المصادقة وحاول مرة أخرى.", err_emr_unavailable: "السجل الطبي لا يستجيب حالياً. حاول مرة أخرى بعد قليل.",
  err_not_in_emr: "لا يوجد مريض بهذا الرقم في السجل الطبي. تحقق من الرقم وحاول مرة أخرى.", err_file_type: "لا يمكن مشاركة هذا الملف. استخدم PDF أو JPG أو PNG أو DOCX أو M4A بحجم لا يتجاوز 10 ميجابايت.",
  err_username_taken: "اسم المستخدم مستخدم. اختر اسماً آخر.", err_invitation_invalid: "انتهت صلاحية رابط الدعوة أو استُخدم من قبل. اطلب رابطاً جديداً من المركز.",
  err_email_taken: "يوجد مقدم رعاية بهذا البريد بالفعل.", err_bad_mobile: "أدخل رقم جوال من 8 أرقام على الأقل.",
  err_FST_REQ_FILE_TOO_LARGE: "حجم الملف أكبر من 10 ميجابايت.", err_generic: "حدث خطأ. حاول مرة أخرى.",
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
        const key = `err_${code}` as Key;
        return code && key in en ? t(key) : (e as Error)?.message || t("err_generic");
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
