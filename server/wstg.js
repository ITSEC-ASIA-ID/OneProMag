/*
   The OWASP Web Security Testing Guide, as data.

   Why a module: the WSTG is a published method with stable identifiers
   (`WSTG-ATHZ-04`) and a URL per test case. Those identifiers are what a report
   cites and what a checklist row names, so they belong in one place that both
   the shipped WSTG checklist and a guide's citation read from — not in strings
   typed into two files.

   `slug` is stored, not derived: the site spells two of these differently from
   the test title (`DOM-based`, `Client-Side`), and a guessed URL that 404s is
   worse than no link. Every entry below was fetched and answered 200.

   The list is the 116 test cases of the current "latest" guide, without the
   overview pages and without the per-database SQL injection sub-cases: a
   checklist asks what to do, and "SQL Injection" is the thing you do once.
   Sub-cases (Oracle, MySQL, GraphQL…) live one click away on the category page.
*/

export const WSTG_BASE =
  'https://wstg.owasp.org/latest/4-Web_Application_Security_Testing';

/* ============================================================
   The twelve categories, in the order the guide publishes them
   ============================================================ */
export const WSTG_CATEGORIES = [
  {
    key: 'INFO',
    code: 'WSTG-INFO',
    title: 'Information Gathering',
    dir: '01-Information_Gathering',
    cases: [
      ['WSTG-INFO-01', 'Conduct Search Engine Reconnaissance for Information Leakage', '01-Conduct_Search_Engine_Reconnaissance_for_Information_Leakage'],
      ['WSTG-INFO-02', 'Fingerprint Web Server', '02-Fingerprint_Web_Server'],
      ['WSTG-INFO-03', 'Review Webserver Metafiles for Information Leakage', '03-Review_Webserver_Metafiles_for_Information_Leakage'],
      ['WSTG-INFO-04', 'Attack Surface Identification', '04-Attack_Surface_Identification'],
      ['WSTG-INFO-05', 'Review Web Page Content for Information Leakage', '05-Review_Web_Page_Content_for_Information_Leakage'],
      ['WSTG-INFO-06', 'Identify Application Entry Points', '06-Identify_Application_Entry_Points'],
      ['WSTG-INFO-07', 'Map Execution Paths Through Application', '07-Map_Execution_Paths_Through_Application'],
      ['WSTG-INFO-08', 'Fingerprint Web Application Framework', '08-Fingerprint_Web_Application_Framework'],
      ['WSTG-INFO-09', 'Fingerprint Web Application', '09-Fingerprint_Web_Application'],
      ['WSTG-INFO-10', 'Map Application Architecture', '10-Map_Application_Architecture'],
    ],
  },
  {
    key: 'CONF',
    code: 'WSTG-CONF',
    title: 'Configuration and Deployment Management',
    dir: '02-Configuration_and_Deployment_Management',
    cases: [
      ['WSTG-CONF-01', 'Network Infrastructure Configuration', '01-Network_Infrastructure_Configuration'],
      ['WSTG-CONF-02', 'Application Platform Configuration', '02-Application_Platform_Configuration'],
      ['WSTG-CONF-03', 'File Extensions Handling for Sensitive Information', '03-File_Extensions_Handling_for_Sensitive_Information'],
      ['WSTG-CONF-04', 'Review Old Backup and Unreferenced Files for Sensitive Information', '04-Review_Old_Backup_and_Unreferenced_Files_for_Sensitive_Information'],
      ['WSTG-CONF-05', 'Enumerate Infrastructure and Application Admin Interfaces', '05-Enumerate_Infrastructure_and_Application_Admin_Interfaces'],
      ['WSTG-CONF-06', 'HTTP Methods', '06-HTTP_Methods'],
      ['WSTG-CONF-07', 'HTTP Strict Transport Security', '07-HTTP_Strict_Transport_Security'],
      ['WSTG-CONF-08', 'RIA Cross Domain Policy', '08-RIA_Cross_Domain_Policy'],
      ['WSTG-CONF-09', 'File Permissions', '09-File_Permissions'],
      ['WSTG-CONF-10', 'Subdomain Takeover', '10-Subdomain_Takeover'],
      ['WSTG-CONF-11', 'Cloud Storage', '11-Cloud_Storage'],
      ['WSTG-CONF-12', 'Content Security Policy', '12-Content_Security_Policy'],
      ['WSTG-CONF-13', 'Path Confusion', '13-Path_Confusion'],
      ['WSTG-CONF-14', 'Other HTTP Security Header Misconfigurations', '14-Other_HTTP_Security_Header_Misconfigurations'],
      ['WSTG-CONF-15', 'Feature Flag Security Bypass', '15-Feature_Flag_Security_Bypass'],
    ],
  },
  {
    key: 'IDNT',
    code: 'WSTG-IDNT',
    title: 'Identity Management',
    dir: '03-Identity_Management',
    cases: [
      ['WSTG-IDNT-01', 'Role Definitions', '01-Role_Definitions'],
      ['WSTG-IDNT-02', 'User Registration Process', '02-User_Registration_Process'],
      ['WSTG-IDNT-03', 'Account Provisioning Process', '03-Account_Provisioning_Process'],
      ['WSTG-IDNT-04', 'Account Enumeration and Guessable User Account', '04-Account_Enumeration_and_Guessable_User_Account'],
      ['WSTG-IDNT-05', 'Weak or Unenforced Username Policy', '05-Weak_or_Unenforced_Username_Policy'],
    ],
  },
  {
    key: 'ATHN',
    code: 'WSTG-ATHN',
    title: 'Authentication',
    dir: '04-Authentication',
    cases: [
      ['WSTG-ATHN-01', 'Credentials Transported over an Encrypted Channel', '01-Credentials_Transported_over_an_Encrypted_Channel'],
      ['WSTG-ATHN-02', 'Default Credentials', '02-Default_Credentials'],
      ['WSTG-ATHN-03', 'Weak Lock Out Mechanism', '03-Weak_Lock_Out_Mechanism'],
      ['WSTG-ATHN-04', 'Bypassing Authentication Schema', '04-Bypassing_Authentication_Schema'],
      ['WSTG-ATHN-05', 'Vulnerable Remember Password', '05-Vulnerable_Remember_Password'],
      ['WSTG-ATHN-06', 'Browser Cache Weaknesses', '06-Browser_Cache_Weaknesses'],
      ['WSTG-ATHN-07', 'Weak Authentication Methods', '07-Weak_Authentication_Methods'],
      ['WSTG-ATHN-08', 'Weak Security Question Answer', '08-Weak_Security_Question_Answer'],
      ['WSTG-ATHN-09', 'Weak Password Change or Reset Functionalities', '09-Weak_Password_Change_or_Reset_Functionalities'],
      ['WSTG-ATHN-10', 'Weaker Authentication in Alternative Channel', '10-Weaker_Authentication_in_Alternative_Channel'],
      ['WSTG-ATHN-11', 'Multi-Factor Authentication', '11-Multi-Factor_Authentication'],
    ],
  },
  {
    key: 'ATHZ',
    code: 'WSTG-ATHZ',
    title: 'Authorization',
    dir: '05-Authorization',
    cases: [
      ['WSTG-ATHZ-01', 'Directory Traversal File Include', '01-Directory_Traversal_File_Include'],
      ['WSTG-ATHZ-02', 'Bypassing Authorization Schema', '02-Bypassing_Authorization_Schema'],
      ['WSTG-ATHZ-03', 'Privilege Escalation', '03-Privilege_Escalation'],
      ['WSTG-ATHZ-04', 'Insecure Direct Object References', '04-Insecure_Direct_Object_References'],
      ['WSTG-ATHZ-05', 'OAuth Weaknesses', '05-OAuth_Weaknesses'],
    ],
  },
  {
    key: 'SESS',
    code: 'WSTG-SESS',
    title: 'Session Management',
    dir: '06-Session_Management',
    cases: [
      ['WSTG-SESS-01', 'Session Management Schema', '01-Session_Management_Schema'],
      ['WSTG-SESS-02', 'Cookies Attributes', '02-Cookies_Attributes'],
      ['WSTG-SESS-03', 'Session Fixation', '03-Session_Fixation'],
      ['WSTG-SESS-04', 'Exposed Session Variables', '04-Exposed_Session_Variables'],
      ['WSTG-SESS-05', 'Cross Site Request Forgery', '05-Cross_Site_Request_Forgery'],
      ['WSTG-SESS-06', 'Logout Functionality', '06-Logout_Functionality'],
      ['WSTG-SESS-07', 'Session Timeout', '07-Session_Timeout'],
      ['WSTG-SESS-08', 'Session Puzzling', '08-Session_Puzzling'],
      ['WSTG-SESS-09', 'Session Hijacking', '09-Session_Hijacking'],
      ['WSTG-SESS-10', 'JSON Web Tokens', '10-JSON_Web_Tokens'],
      ['WSTG-SESS-11', 'Concurrent Sessions', '11-Concurrent_Sessions'],
    ],
  },
  {
    key: 'INPV',
    code: 'WSTG-INPV',
    title: 'Injection',
    dir: '07-Injection',
    cases: [
      ['WSTG-INPV-01', 'Reflected Cross Site Scripting', '01-Reflected_Cross_Site_Scripting'],
      ['WSTG-INPV-02', 'Stored Cross Site Scripting', '02-Stored_Cross_Site_Scripting'],
      ['WSTG-INPV-03', 'HTTP Verb Tampering', '03-HTTP_Verb_Tampering'],
      ['WSTG-INPV-04', 'HTTP Parameter Pollution', '04-HTTP_Parameter_Pollution'],
      ['WSTG-INPV-05', 'SQL Injection', '05-SQL_Injection'],
      ['WSTG-INPV-06', 'LDAP Injection', '06-LDAP_Injection'],
      ['WSTG-INPV-07', 'XML Injection', '07-XML_Injection'],
      ['WSTG-INPV-08', 'SSI Injection', '08-SSI_Injection'],
      ['WSTG-INPV-09', 'XPath Injection', '09-XPath_Injection'],
      ['WSTG-INPV-10', 'IMAP SMTP Injection', '10-IMAP_SMTP_Injection'],
      ['WSTG-INPV-11', 'Code Injection', '11-Code_Injection'],
      ['WSTG-INPV-12', 'Command Injection', '12-Command_Injection'],
      ['WSTG-INPV-13', 'Format String Injection', '13-Format_String_Injection'],
      ['WSTG-INPV-14', 'Incubated Vulnerability', '14-Incubated_Vulnerability'],
      ['WSTG-INPV-15', 'HTTP Response Splitting', '15-HTTP_Response_Splitting'],
      ['WSTG-INPV-16', 'HTTP Request Smuggling', '16-HTTP_Request_Smuggling'],
      ['WSTG-INPV-17', 'Host Header Injection', '17-Host_Header_Injection'],
      ['WSTG-INPV-18', 'Server-side Template Injection', '18-Server-side_Template_Injection'],
      ['WSTG-INPV-19', 'Server-Side Request Forgery', '19-Server-Side_Request_Forgery'],
      ['WSTG-INPV-20', 'Mass Assignment', '20-Mass_Assignment'],
      ['WSTG-INPV-21', 'CSV Injection', '21-CSV_Injection'],
      ['WSTG-INPV-22', 'Prototype Pollution', '22-Prototype_Pollution'],
      ['WSTG-INPV-23', 'Insecure Deserialization', '23-Insecure_Deserialization'],
    ],
  },
  {
    key: 'ERRH',
    code: 'WSTG-ERRH',
    title: 'Error Handling',
    dir: '08-Error_Handling',
    cases: [
      ['WSTG-ERRH-01', 'Improper Error Handling', '01-Improper_Error_Handling'],
      ['WSTG-ERRH-02', 'Stack Traces', '02-Stack_Traces'],
    ],
  },
  {
    key: 'CRYP',
    code: 'WSTG-CRYP',
    title: 'Weak Cryptography',
    dir: '09-Weak_Cryptography',
    cases: [
      ['WSTG-CRYP-01', 'Weak Transport Layer Security', '01-Weak_Transport_Layer_Security'],
      ['WSTG-CRYP-02', 'Padding Oracle', '02-Padding_Oracle'],
      ['WSTG-CRYP-03', 'Sensitive Information Sent via Unencrypted Channels', '03-Sensitive_Information_Sent_via_Unencrypted_Channels'],
      ['WSTG-CRYP-04', 'Weak Cryptographic Primitives', '04-Weak_Cryptographic_Primitives'],
    ],
  },
  {
    key: 'BUSL',
    code: 'WSTG-BUSL',
    title: 'Business Logic',
    dir: '10-Business_Logic',
    cases: [
      ['WSTG-BUSL-01', 'Business Logic Data Validation', '01-Business_Logic_Data_Validation'],
      ['WSTG-BUSL-02', 'Ability to Forge Requests', '02-Ability_to_Forge_Requests'],
      ['WSTG-BUSL-03', 'Integrity Checks', '03-Integrity_Checks'],
      ['WSTG-BUSL-04', 'Process Timing', '04-Process_Timing'],
      ['WSTG-BUSL-05', 'Number of Times a Function Can Be Used Limits', '05-Number_of_Times_a_Function_Can_Be_Used_Limits'],
      ['WSTG-BUSL-06', 'Circumvention of Work Flows', '06-Circumvention_of_Work_Flows'],
      ['WSTG-BUSL-07', 'Defenses Against Application Misuse', '07-Defenses_Against_Application_Misuse'],
      ['WSTG-BUSL-08', 'Upload of Unexpected File Types', '08-Upload_of_Unexpected_File_Types'],
      ['WSTG-BUSL-09', 'Upload of Malicious Files', '09-Upload_of_Malicious_Files'],
      ['WSTG-BUSL-10', 'Payment Functionality', '10-Payment_Functionality'],
    ],
  },
  {
    key: 'CLNT',
    code: 'WSTG-CLNT',
    title: 'Client-side',
    dir: '11-Client-side',
    cases: [
      ['WSTG-CLNT-01', 'DOM-Based Cross Site Scripting', '01-DOM-based_Cross_Site_Scripting'],
      ['WSTG-CLNT-02', 'JavaScript Execution', '02-JavaScript_Execution'],
      ['WSTG-CLNT-03', 'HTML Injection', '03-HTML_Injection'],
      ['WSTG-CLNT-04', 'Client-side URL Redirect', '04-Client-side_URL_Redirect'],
      ['WSTG-CLNT-05', 'CSS Injection', '05-CSS_Injection'],
      ['WSTG-CLNT-06', 'Client-side Resource Manipulation', '06-Client-side_Resource_Manipulation'],
      ['WSTG-CLNT-07', 'Cross Origin Resource Sharing', '07-Cross_Origin_Resource_Sharing'],
      ['WSTG-CLNT-08', 'Cross Site Flashing', '08-Cross_Site_Flashing'],
      ['WSTG-CLNT-09', 'Clickjacking', '09-Clickjacking'],
      ['WSTG-CLNT-10', 'WebSockets', '10-WebSockets'],
      ['WSTG-CLNT-11', 'Web Messaging', '11-Web_Messaging'],
      ['WSTG-CLNT-12', 'Browser Storage', '12-Browser_Storage'],
      ['WSTG-CLNT-13', 'Cross Site Script Inclusion', '13-Cross_Site_Script_Inclusion'],
      ['WSTG-CLNT-14', 'Reverse Tabnabbing', '14-Reverse_Tabnabbing'],
      ['WSTG-CLNT-15', 'Client-side Template Injection', '15-Client-Side_Template_Injection'],
    ],
  },
  {
    key: 'APIT',
    code: 'WSTG-APIT',
    title: 'API Testing',
    dir: '12-API_Testing',
    cases: [
      ['WSTG-APIT-01', 'API Reconnaissance', '01-API_Reconnaissance'],
      ['WSTG-APIT-02', 'API Broken Object Level Authorization', '02-API_Broken_Object_Level_Authorization'],
      ['WSTG-APIT-03', 'Excessive Data Exposure', '03-Excessive_Data_Exposure'],
      ['WSTG-APIT-04', 'API Broken Function Level Authorization', '04-API_Broken_Function_Level_Authorization'],
      ['WSTG-APIT-99', 'GraphQL', '99-GraphQL'],
    ],
  },
];

/* ============================================================
   Reads
   ============================================================ */
const categoryOf = new Map(WSTG_CATEGORIES.map((c) => [c.code, c]));

/** Every case, flat, with its category and its absolute URL. */
export const WSTG_CASES = WSTG_CATEGORIES.flatMap((category) =>
  category.cases.map(([code, title, slug]) => ({
    code,
    title,
    category: category.code,
    categoryTitle: category.title,
    url: `${WSTG_BASE}/${category.dir}/${slug}/`,
  }))
);

/** `WSTG-ATHZ` or `WSTG-ATHZ-04` → the category code, or `''`. */
export function wstgCategoryCode(value) {
  const found = /^WSTG-([A-Z]{4})(?:-\d{2})?$/.exec(String(value ?? '').trim());
  return found && categoryOf.has(`WSTG-${found[1]}`) ? `WSTG-${found[1]}` : '';
}

export function isWstgCode(value) {
  return Boolean(wstgCategoryCode(value));
}

/** A category or a case → its page on wstg.owasp.org, or `''`. */
export function wstgUrl(value) {
  const raw = String(value ?? '').trim();
  const category = categoryOf.get(wstgCategoryCode(raw));
  if (!category) return '';
  const found = WSTG_CASES.find((c) => c.code === raw);
  return found ? found.url : `${WSTG_BASE}/${category.dir}/`;
}

export function wstgTitle(value) {
  const category = categoryOf.get(wstgCategoryCode(value));
  return category ? category.title : '';
}
