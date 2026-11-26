-- The OWASP Web Testing Guide, as data.
--
-- Not a code module: the Admin panel edits these rows, the guides cite them, and
-- the OWASP WSTG checklist template is written from them, so all three read one
-- table rather than agreeing with a constant. This file only seeds; it is run on
-- every boot and inserts what is missing, so a title an admin corrected on
-- Tuesday is still their correction on Wednesday.
--
-- Written as INSERT ... SELECT ... WHERE NOT EXISTS because that spelling works
-- unchanged on both engines (SQLite has no ON CONFLICT DO NOTHING before 3.24,
-- and Postgres has no INSERT OR IGNORE).
--
-- The slug is a column, not something derived from the title: the site publishes
-- 01-DOM-based_Cross_Site_Scripting and 15-Client-Side_Template_Injection, whose
-- capitalisation no rule would guess, and a guessed URL that 404s is worse than
-- none. Each one is https://wstg.owasp.org/latest/<dir>/<slug>/ — the 2026 edition
-- dropped the 4-Web_Application_Security_Testing part of the path and moved the
-- folders from 01..12 to 05..16, so the repair at the end of this file rewrites
-- the rows earlier versions seeded.

-- 12 categories, in the order OWASP publishes them.

INSERT INTO categories (code, title, dir, position)
  SELECT 'WSTG-INFO', 'Information Gathering', '01-Information_Gathering', 0
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE code = 'WSTG-INFO');

INSERT INTO categories (code, title, dir, position)
  SELECT 'WSTG-CONF', 'Configuration and Deployment Management', '02-Configuration_and_Deployment_Management', 1
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE code = 'WSTG-CONF');

INSERT INTO categories (code, title, dir, position)
  SELECT 'WSTG-IDNT', 'Identity Management', '03-Identity_Management', 2
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE code = 'WSTG-IDNT');

INSERT INTO categories (code, title, dir, position)
  SELECT 'WSTG-ATHN', 'Authentication', '04-Authentication', 3
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE code = 'WSTG-ATHN');

INSERT INTO categories (code, title, dir, position)
  SELECT 'WSTG-ATHZ', 'Authorization', '05-Authorization', 4
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE code = 'WSTG-ATHZ');

INSERT INTO categories (code, title, dir, position)
  SELECT 'WSTG-SESS', 'Session Management', '06-Session_Management', 5
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE code = 'WSTG-SESS');

INSERT INTO categories (code, title, dir, position)
  SELECT 'WSTG-INPV', 'Injection', '07-Injection', 6
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE code = 'WSTG-INPV');

INSERT INTO categories (code, title, dir, position)
  SELECT 'WSTG-ERRH', 'Error Handling', '08-Error_Handling', 7
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE code = 'WSTG-ERRH');

INSERT INTO categories (code, title, dir, position)
  SELECT 'WSTG-CRYP', 'Weak Cryptography', '09-Weak_Cryptography', 8
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE code = 'WSTG-CRYP');

INSERT INTO categories (code, title, dir, position)
  SELECT 'WSTG-BUSL', 'Business Logic', '10-Business_Logic', 9
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE code = 'WSTG-BUSL');

INSERT INTO categories (code, title, dir, position)
  SELECT 'WSTG-CLNT', 'Client-side', '11-Client-side', 10
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE code = 'WSTG-CLNT');

INSERT INTO categories (code, title, dir, position)
  SELECT 'WSTG-APIT', 'API Testing', '12-API_Testing', 11
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE code = 'WSTG-APIT');


-- 116 test cases. Overview pages and the per-database SQL-injection sub-cases
-- are deliberately absent: they are reading, not a check a tester runs.

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-APIT-01', 'WSTG-APIT', 'API Reconnaissance', '01-API_Reconnaissance', 0
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-APIT-01');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHN-01', 'WSTG-ATHN', 'Credentials Transported over an Encrypted Channel', '01-Credentials_Transported_over_an_Encrypted_Channel', 0
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHN-01');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHZ-01', 'WSTG-ATHZ', 'Directory Traversal File Include', '01-Directory_Traversal_File_Include', 0
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHZ-01');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-BUSL-01', 'WSTG-BUSL', 'Business Logic Data Validation', '01-Business_Logic_Data_Validation', 0
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-BUSL-01');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CLNT-01', 'WSTG-CLNT', 'DOM-Based Cross Site Scripting', '01-DOM-based_Cross_Site_Scripting', 0
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CLNT-01');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CONF-01', 'WSTG-CONF', 'Network Infrastructure Configuration', '01-Network_Infrastructure_Configuration', 0
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CONF-01');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CRYP-01', 'WSTG-CRYP', 'Weak Transport Layer Security', '01-Weak_Transport_Layer_Security', 0
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CRYP-01');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ERRH-01', 'WSTG-ERRH', 'Improper Error Handling', '01-Improper_Error_Handling', 0
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ERRH-01');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-IDNT-01', 'WSTG-IDNT', 'Role Definitions', '01-Role_Definitions', 0
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-IDNT-01');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INFO-01', 'WSTG-INFO', 'Conduct Search Engine Reconnaissance for Information Leakage', '01-Conduct_Search_Engine_Reconnaissance_for_Information_Leakage', 0
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INFO-01');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-01', 'WSTG-INPV', 'Reflected Cross Site Scripting', '01-Reflected_Cross_Site_Scripting', 0
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-01');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-SESS-01', 'WSTG-SESS', 'Session Management Schema', '01-Session_Management_Schema', 0
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-SESS-01');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-APIT-02', 'WSTG-APIT', 'API Broken Object Level Authorization', '02-API_Broken_Object_Level_Authorization', 1
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-APIT-02');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHN-02', 'WSTG-ATHN', 'Default Credentials', '02-Default_Credentials', 1
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHN-02');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHZ-02', 'WSTG-ATHZ', 'Bypassing Authorization Schema', '02-Bypassing_Authorization_Schema', 1
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHZ-02');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-BUSL-02', 'WSTG-BUSL', 'Ability to Forge Requests', '02-Ability_to_Forge_Requests', 1
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-BUSL-02');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CLNT-02', 'WSTG-CLNT', 'JavaScript Execution', '02-JavaScript_Execution', 1
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CLNT-02');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CONF-02', 'WSTG-CONF', 'Application Platform Configuration', '02-Application_Platform_Configuration', 1
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CONF-02');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CRYP-02', 'WSTG-CRYP', 'Padding Oracle', '02-Padding_Oracle', 1
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CRYP-02');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ERRH-02', 'WSTG-ERRH', 'Stack Traces', '02-Stack_Traces', 1
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ERRH-02');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-IDNT-02', 'WSTG-IDNT', 'User Registration Process', '02-User_Registration_Process', 1
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-IDNT-02');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INFO-02', 'WSTG-INFO', 'Fingerprint Web Server', '02-Fingerprint_Web_Server', 1
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INFO-02');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-02', 'WSTG-INPV', 'Stored Cross Site Scripting', '02-Stored_Cross_Site_Scripting', 1
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-02');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-SESS-02', 'WSTG-SESS', 'Cookies Attributes', '02-Cookies_Attributes', 1
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-SESS-02');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-APIT-03', 'WSTG-APIT', 'Excessive Data Exposure', '03-Excessive_Data_Exposure', 2
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-APIT-03');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHN-03', 'WSTG-ATHN', 'Weak Lock Out Mechanism', '03-Weak_Lock_Out_Mechanism', 2
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHN-03');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHZ-03', 'WSTG-ATHZ', 'Privilege Escalation', '03-Privilege_Escalation', 2
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHZ-03');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-BUSL-03', 'WSTG-BUSL', 'Integrity Checks', '03-Integrity_Checks', 2
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-BUSL-03');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CLNT-03', 'WSTG-CLNT', 'HTML Injection', '03-HTML_Injection', 2
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CLNT-03');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CONF-03', 'WSTG-CONF', 'File Extensions Handling for Sensitive Information', '03-File_Extensions_Handling_for_Sensitive_Information', 2
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CONF-03');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CRYP-03', 'WSTG-CRYP', 'Sensitive Information Sent via Unencrypted Channels', '03-Sensitive_Information_Sent_via_Unencrypted_Channels', 2
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CRYP-03');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-IDNT-03', 'WSTG-IDNT', 'Account Provisioning Process', '03-Account_Provisioning_Process', 2
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-IDNT-03');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INFO-03', 'WSTG-INFO', 'Review Webserver Metafiles for Information Leakage', '03-Review_Webserver_Metafiles_for_Information_Leakage', 2
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INFO-03');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-03', 'WSTG-INPV', 'HTTP Verb Tampering', '03-HTTP_Verb_Tampering', 2
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-03');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-SESS-03', 'WSTG-SESS', 'Session Fixation', '03-Session_Fixation', 2
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-SESS-03');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-APIT-04', 'WSTG-APIT', 'API Broken Function Level Authorization', '04-API_Broken_Function_Level_Authorization', 3
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-APIT-04');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHN-04', 'WSTG-ATHN', 'Bypassing Authentication Schema', '04-Bypassing_Authentication_Schema', 3
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHN-04');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHZ-04', 'WSTG-ATHZ', 'Insecure Direct Object References', '04-Insecure_Direct_Object_References', 3
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHZ-04');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-BUSL-04', 'WSTG-BUSL', 'Process Timing', '04-Process_Timing', 3
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-BUSL-04');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CLNT-04', 'WSTG-CLNT', 'Client-side URL Redirect', '04-Client-side_URL_Redirect', 3
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CLNT-04');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CONF-04', 'WSTG-CONF', 'Review Old Backup and Unreferenced Files for Sensitive Information', '04-Review_Old_Backup_and_Unreferenced_Files_for_Sensitive_Information', 3
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CONF-04');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CRYP-04', 'WSTG-CRYP', 'Weak Cryptographic Primitives', '04-Weak_Cryptographic_Primitives', 3
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CRYP-04');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-IDNT-04', 'WSTG-IDNT', 'Account Enumeration and Guessable User Account', '04-Account_Enumeration_and_Guessable_User_Account', 3
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-IDNT-04');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INFO-04', 'WSTG-INFO', 'Attack Surface Identification', '04-Attack_Surface_Identification', 3
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INFO-04');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-04', 'WSTG-INPV', 'HTTP Parameter Pollution', '04-HTTP_Parameter_Pollution', 3
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-04');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-SESS-04', 'WSTG-SESS', 'Exposed Session Variables', '04-Exposed_Session_Variables', 3
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-SESS-04');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-APIT-99', 'WSTG-APIT', 'GraphQL', '99-GraphQL', 4
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-APIT-99');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHN-05', 'WSTG-ATHN', 'Vulnerable Remember Password', '05-Vulnerable_Remember_Password', 4
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHN-05');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHZ-05', 'WSTG-ATHZ', 'OAuth Weaknesses', '05-OAuth_Weaknesses', 4
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHZ-05');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-BUSL-05', 'WSTG-BUSL', 'Number of Times a Function Can Be Used Limits', '05-Number_of_Times_a_Function_Can_Be_Used_Limits', 4
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-BUSL-05');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CLNT-05', 'WSTG-CLNT', 'CSS Injection', '05-CSS_Injection', 4
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CLNT-05');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CONF-05', 'WSTG-CONF', 'Enumerate Infrastructure and Application Admin Interfaces', '05-Enumerate_Infrastructure_and_Application_Admin_Interfaces', 4
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CONF-05');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-IDNT-05', 'WSTG-IDNT', 'Weak or Unenforced Username Policy', '05-Weak_or_Unenforced_Username_Policy', 4
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-IDNT-05');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INFO-05', 'WSTG-INFO', 'Review Web Page Content for Information Leakage', '05-Review_Web_Page_Content_for_Information_Leakage', 4
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INFO-05');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-05', 'WSTG-INPV', 'SQL Injection', '05-SQL_Injection', 4
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-05');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-SESS-05', 'WSTG-SESS', 'Cross Site Request Forgery', '05-Cross_Site_Request_Forgery', 4
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-SESS-05');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHN-06', 'WSTG-ATHN', 'Browser Cache Weaknesses', '06-Browser_Cache_Weaknesses', 5
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHN-06');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-BUSL-06', 'WSTG-BUSL', 'Circumvention of Work Flows', '06-Circumvention_of_Work_Flows', 5
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-BUSL-06');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CLNT-06', 'WSTG-CLNT', 'Client-side Resource Manipulation', '06-Client-side_Resource_Manipulation', 5
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CLNT-06');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CONF-06', 'WSTG-CONF', 'HTTP Methods', '06-HTTP_Methods', 5
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CONF-06');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INFO-06', 'WSTG-INFO', 'Identify Application Entry Points', '06-Identify_Application_Entry_Points', 5
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INFO-06');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-06', 'WSTG-INPV', 'LDAP Injection', '06-LDAP_Injection', 5
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-06');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-SESS-06', 'WSTG-SESS', 'Logout Functionality', '06-Logout_Functionality', 5
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-SESS-06');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHN-07', 'WSTG-ATHN', 'Weak Authentication Methods', '07-Weak_Authentication_Methods', 6
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHN-07');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-BUSL-07', 'WSTG-BUSL', 'Defenses Against Application Misuse', '07-Defenses_Against_Application_Misuse', 6
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-BUSL-07');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CLNT-07', 'WSTG-CLNT', 'Cross Origin Resource Sharing', '07-Cross_Origin_Resource_Sharing', 6
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CLNT-07');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CONF-07', 'WSTG-CONF', 'HTTP Strict Transport Security', '07-HTTP_Strict_Transport_Security', 6
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CONF-07');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INFO-07', 'WSTG-INFO', 'Map Execution Paths Through Application', '07-Map_Execution_Paths_Through_Application', 6
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INFO-07');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-07', 'WSTG-INPV', 'XML Injection', '07-XML_Injection', 6
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-07');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-SESS-07', 'WSTG-SESS', 'Session Timeout', '07-Session_Timeout', 6
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-SESS-07');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHN-08', 'WSTG-ATHN', 'Weak Security Question Answer', '08-Weak_Security_Question_Answer', 7
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHN-08');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-BUSL-08', 'WSTG-BUSL', 'Upload of Unexpected File Types', '08-Upload_of_Unexpected_File_Types', 7
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-BUSL-08');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CLNT-08', 'WSTG-CLNT', 'Cross Site Flashing', '08-Cross_Site_Flashing', 7
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CLNT-08');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CONF-08', 'WSTG-CONF', 'RIA Cross Domain Policy', '08-RIA_Cross_Domain_Policy', 7
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CONF-08');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INFO-08', 'WSTG-INFO', 'Fingerprint Web Application Framework', '08-Fingerprint_Web_Application_Framework', 7
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INFO-08');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-08', 'WSTG-INPV', 'SSI Injection', '08-SSI_Injection', 7
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-08');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-SESS-08', 'WSTG-SESS', 'Session Puzzling', '08-Session_Puzzling', 7
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-SESS-08');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHN-09', 'WSTG-ATHN', 'Weak Password Change or Reset Functionalities', '09-Weak_Password_Change_or_Reset_Functionalities', 8
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHN-09');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-BUSL-09', 'WSTG-BUSL', 'Upload of Malicious Files', '09-Upload_of_Malicious_Files', 8
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-BUSL-09');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CLNT-09', 'WSTG-CLNT', 'Clickjacking', '09-Clickjacking', 8
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CLNT-09');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CONF-09', 'WSTG-CONF', 'File Permissions', '09-File_Permissions', 8
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CONF-09');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INFO-09', 'WSTG-INFO', 'Fingerprint Web Application', '09-Fingerprint_Web_Application', 8
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INFO-09');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-09', 'WSTG-INPV', 'XPath Injection', '09-XPath_Injection', 8
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-09');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-SESS-09', 'WSTG-SESS', 'Session Hijacking', '09-Session_Hijacking', 8
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-SESS-09');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHN-10', 'WSTG-ATHN', 'Weaker Authentication in Alternative Channel', '10-Weaker_Authentication_in_Alternative_Channel', 9
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHN-10');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-BUSL-10', 'WSTG-BUSL', 'Payment Functionality', '10-Payment_Functionality', 9
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-BUSL-10');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CLNT-10', 'WSTG-CLNT', 'WebSockets', '10-WebSockets', 9
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CLNT-10');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CONF-10', 'WSTG-CONF', 'Subdomain Takeover', '10-Subdomain_Takeover', 9
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CONF-10');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INFO-10', 'WSTG-INFO', 'Map Application Architecture', '10-Map_Application_Architecture', 9
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INFO-10');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-10', 'WSTG-INPV', 'IMAP SMTP Injection', '10-IMAP_SMTP_Injection', 9
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-10');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-SESS-10', 'WSTG-SESS', 'JSON Web Tokens', '10-JSON_Web_Tokens', 9
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-SESS-10');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-ATHN-11', 'WSTG-ATHN', 'Multi-Factor Authentication', '11-Multi-Factor_Authentication', 10
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-ATHN-11');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CLNT-11', 'WSTG-CLNT', 'Web Messaging', '11-Web_Messaging', 10
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CLNT-11');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CONF-11', 'WSTG-CONF', 'Cloud Storage', '11-Cloud_Storage', 10
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CONF-11');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-11', 'WSTG-INPV', 'Code Injection', '11-Code_Injection', 10
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-11');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-SESS-11', 'WSTG-SESS', 'Concurrent Sessions', '11-Concurrent_Sessions', 10
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-SESS-11');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CLNT-12', 'WSTG-CLNT', 'Browser Storage', '12-Browser_Storage', 11
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CLNT-12');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CONF-12', 'WSTG-CONF', 'Content Security Policy', '12-Content_Security_Policy', 11
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CONF-12');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-12', 'WSTG-INPV', 'Command Injection', '12-Command_Injection', 11
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-12');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CLNT-13', 'WSTG-CLNT', 'Cross Site Script Inclusion', '13-Cross_Site_Script_Inclusion', 12
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CLNT-13');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CONF-13', 'WSTG-CONF', 'Path Confusion', '13-Path_Confusion', 12
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CONF-13');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-13', 'WSTG-INPV', 'Format String Injection', '13-Format_String_Injection', 12
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-13');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CLNT-14', 'WSTG-CLNT', 'Reverse Tabnabbing', '14-Reverse_Tabnabbing', 13
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CLNT-14');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CONF-14', 'WSTG-CONF', 'Other HTTP Security Header Misconfigurations', '14-Other_HTTP_Security_Header_Misconfigurations', 13
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CONF-14');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-14', 'WSTG-INPV', 'Incubated Vulnerability', '14-Incubated_Vulnerability', 13
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-14');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CLNT-15', 'WSTG-CLNT', 'Client-side Template Injection', '15-Client-Side_Template_Injection', 14
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CLNT-15');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-CONF-15', 'WSTG-CONF', 'Feature Flag Security Bypass', '15-Feature_Flag_Security_Bypass', 14
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-CONF-15');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-15', 'WSTG-INPV', 'HTTP Response Splitting', '15-HTTP_Response_Splitting', 14
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-15');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-16', 'WSTG-INPV', 'HTTP Request Smuggling', '16-HTTP_Request_Smuggling', 15
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-16');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-17', 'WSTG-INPV', 'Host Header Injection', '17-Host_Header_Injection', 16
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-17');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-18', 'WSTG-INPV', 'Server-side Template Injection', '18-Server-side_Template_Injection', 17
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-18');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-19', 'WSTG-INPV', 'Server-Side Request Forgery', '19-Server-Side_Request_Forgery', 18
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-19');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-20', 'WSTG-INPV', 'Mass Assignment', '20-Mass_Assignment', 19
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-20');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-21', 'WSTG-INPV', 'CSV Injection', '21-CSV_Injection', 20
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-21');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-22', 'WSTG-INPV', 'Prototype Pollution', '22-Prototype_Pollution', 21
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-22');

INSERT INTO cases (code, category_code, title, slug, position)
  SELECT 'WSTG-INPV-23', 'WSTG-INPV', 'Insecure Deserialization', '23-Insecure_Deserialization', 22
  WHERE NOT EXISTS (SELECT 1 FROM cases WHERE code = 'WSTG-INPV-23');

-- The 2026 edition republished every page under a new path: the guide moved
-- from 4-Web_Application_Security_Testing/01-Information_Gathering to
-- 05-Information_Gathering, and the cases were renumbered with it. Each
-- statement only fires while the row still holds the old value, so a URL an
-- admin corrected by hand is never overwritten by a reboot.

UPDATE categories SET dir = '05-Information_Gathering' WHERE code = 'WSTG-INFO' AND dir = '01-Information_Gathering';
UPDATE categories SET dir = '06-Configuration_and_Deployment_Management' WHERE code = 'WSTG-CONF' AND dir = '02-Configuration_and_Deployment_Management';
UPDATE categories SET dir = '07-Identity_Management' WHERE code = 'WSTG-IDNT' AND dir = '03-Identity_Management';
UPDATE categories SET dir = '08-Authentication' WHERE code = 'WSTG-ATHN' AND dir = '04-Authentication';
UPDATE categories SET dir = '09-Authorization' WHERE code = 'WSTG-ATHZ' AND dir = '05-Authorization';
UPDATE categories SET dir = '10-Session_Management' WHERE code = 'WSTG-SESS' AND dir = '06-Session_Management';
UPDATE categories SET dir = '11-Injection' WHERE code = 'WSTG-INPV' AND dir = '07-Injection';
UPDATE categories SET dir = '12-Error_Handling' WHERE code = 'WSTG-ERRH' AND dir = '08-Error_Handling';
UPDATE categories SET dir = '13-Weak_Cryptography' WHERE code = 'WSTG-CRYP' AND dir = '09-Weak_Cryptography';
UPDATE categories SET dir = '14-Business_Logic' WHERE code = 'WSTG-BUSL' AND dir = '10-Business_Logic';
UPDATE categories SET dir = '15-Client-side' WHERE code = 'WSTG-CLNT' AND dir = '11-Client-side';
UPDATE categories SET dir = '16-API_Testing' WHERE code = 'WSTG-APIT' AND dir = '12-API_Testing';

UPDATE cases SET slug = '03-Sensitive_Information_Sent_via_Unencrypted_Channels' WHERE code = 'WSTG-ATHN-01' AND slug = '01-Credentials_Transported_over_an_Encrypted_Channel';
UPDATE cases SET slug = '01-Default_Credentials' WHERE code = 'WSTG-ATHN-02' AND slug = '02-Default_Credentials';
UPDATE cases SET slug = '02-Weak_Lock_Out_Mechanism' WHERE code = 'WSTG-ATHN-03' AND slug = '03-Weak_Lock_Out_Mechanism';
UPDATE cases SET slug = '03-Bypassing_Authentication_Schema' WHERE code = 'WSTG-ATHN-04' AND slug = '04-Bypassing_Authentication_Schema';
UPDATE cases SET slug = '04-Vulnerable_Remember_Password' WHERE code = 'WSTG-ATHN-05' AND slug = '05-Vulnerable_Remember_Password';
UPDATE cases SET slug = '05-Browser_Cache_Weaknesses' WHERE code = 'WSTG-ATHN-06' AND slug = '06-Browser_Cache_Weaknesses';
UPDATE cases SET slug = '06-Weak_Authentication_Methods' WHERE code = 'WSTG-ATHN-07' AND slug = '07-Weak_Authentication_Methods';
UPDATE cases SET slug = '07-Weak_Security_Question_Answer' WHERE code = 'WSTG-ATHN-08' AND slug = '08-Weak_Security_Question_Answer';
UPDATE cases SET slug = '08-Weak_Password_Change_or_Reset_Functionalities' WHERE code = 'WSTG-ATHN-09' AND slug = '09-Weak_Password_Change_or_Reset_Functionalities';
UPDATE cases SET slug = '09-Weaker_Authentication_in_Alternative_Channel' WHERE code = 'WSTG-ATHN-10' AND slug = '10-Weaker_Authentication_in_Alternative_Channel';
UPDATE cases SET slug = '10-Multi-Factor_Authentication' WHERE code = 'WSTG-ATHN-11' AND slug = '11-Multi-Factor_Authentication';
UPDATE cases SET slug = '08-Clickjacking' WHERE code = 'WSTG-CLNT-09' AND slug = '09-Clickjacking';
UPDATE cases SET slug = '09-WebSockets' WHERE code = 'WSTG-CLNT-10' AND slug = '10-WebSockets';
UPDATE cases SET slug = '10-Web_Messaging' WHERE code = 'WSTG-CLNT-11' AND slug = '11-Web_Messaging';
UPDATE cases SET slug = '11-Browser_Storage' WHERE code = 'WSTG-CLNT-12' AND slug = '12-Browser_Storage';
UPDATE cases SET slug = '12-Cross_Site_Script_Inclusion' WHERE code = 'WSTG-CLNT-13' AND slug = '13-Cross_Site_Script_Inclusion';
UPDATE cases SET slug = '13-Reverse_Tabnabbing' WHERE code = 'WSTG-CLNT-14' AND slug = '14-Reverse_Tabnabbing';
UPDATE cases SET slug = '14-Client-Side_Template_Injection' WHERE code = 'WSTG-CLNT-15' AND slug = '15-Client-Side_Template_Injection';
UPDATE cases SET slug = '03-Review_Old_Backup_and_Unreferenced_Files_for_Sensitive_Information' WHERE code = 'WSTG-CONF-04' AND slug = '04-Review_Old_Backup_and_Unreferenced_Files_for_Sensitive_Information';
UPDATE cases SET slug = '04-Enumerate_Infrastructure_and_Application_Admin_Interfaces' WHERE code = 'WSTG-CONF-05' AND slug = '05-Enumerate_Infrastructure_and_Application_Admin_Interfaces';
UPDATE cases SET slug = '05-HTTP_Methods' WHERE code = 'WSTG-CONF-06' AND slug = '06-HTTP_Methods';
UPDATE cases SET slug = '06-HTTP_Strict_Transport_Security' WHERE code = 'WSTG-CONF-07' AND slug = '07-HTTP_Strict_Transport_Security';
UPDATE cases SET slug = '07-File_Permissions' WHERE code = 'WSTG-CONF-09' AND slug = '09-File_Permissions';
UPDATE cases SET slug = '08-Subdomain_Takeover' WHERE code = 'WSTG-CONF-10' AND slug = '10-Subdomain_Takeover';
UPDATE cases SET slug = '09-Cloud_Storage' WHERE code = 'WSTG-CONF-11' AND slug = '11-Cloud_Storage';
UPDATE cases SET slug = '10-Content_Security_Policy' WHERE code = 'WSTG-CONF-12' AND slug = '12-Content_Security_Policy';
UPDATE cases SET slug = '11-Path_Confusion' WHERE code = 'WSTG-CONF-13' AND slug = '13-Path_Confusion';
UPDATE cases SET slug = '13-Feature_Flag_Security_Bypass' WHERE code = 'WSTG-CONF-15' AND slug = '15-Feature_Flag_Security_Bypass';
UPDATE cases SET slug = '01-Improper_Error_Handling' WHERE code = 'WSTG-ERRH-02' AND slug = '02-Stack_Traces';
UPDATE cases SET slug = '09-Map_Application_Architecture' WHERE code = 'WSTG-INFO-10' AND slug = '10-Map_Application_Architecture';
UPDATE cases SET slug = '05-HTTP_Methods' WHERE code = 'WSTG-INPV-03' AND slug = '03-HTTP_Verb_Tampering';
UPDATE cases SET slug = '03-HTTP_Parameter_Pollution' WHERE code = 'WSTG-INPV-04' AND slug = '04-HTTP_Parameter_Pollution';
UPDATE cases SET slug = '04-SQL_Injection' WHERE code = 'WSTG-INPV-05' AND slug = '05-SQL_Injection';
UPDATE cases SET slug = '05-LDAP_Injection' WHERE code = 'WSTG-INPV-06' AND slug = '06-LDAP_Injection';
UPDATE cases SET slug = '06-XML_Injection' WHERE code = 'WSTG-INPV-07' AND slug = '07-XML_Injection';
UPDATE cases SET slug = '07-SSI_Injection' WHERE code = 'WSTG-INPV-08' AND slug = '08-SSI_Injection';
UPDATE cases SET slug = '08-XPath_Injection' WHERE code = 'WSTG-INPV-09' AND slug = '09-XPath_Injection';
UPDATE cases SET slug = '09-IMAP_SMTP_Injection' WHERE code = 'WSTG-INPV-10' AND slug = '10-IMAP_SMTP_Injection';
UPDATE cases SET slug = '10-Code_Injection' WHERE code = 'WSTG-INPV-11' AND slug = '11-Code_Injection';
UPDATE cases SET slug = '11-Command_Injection' WHERE code = 'WSTG-INPV-12' AND slug = '12-Command_Injection';
UPDATE cases SET slug = '12-Format_String_Injection' WHERE code = 'WSTG-INPV-13' AND slug = '13-Format_String_Injection';
UPDATE cases SET slug = '13-Incubated_Vulnerability' WHERE code = 'WSTG-INPV-14' AND slug = '14-Incubated_Vulnerability';
UPDATE cases SET slug = '14-HTTP_Response_Splitting' WHERE code = 'WSTG-INPV-15' AND slug = '15-HTTP_Response_Splitting';
UPDATE cases SET slug = '15-HTTP_Request_Smuggling' WHERE code = 'WSTG-INPV-16' AND slug = '16-HTTP_Request_Smuggling';
UPDATE cases SET slug = '16-Host_Header_Injection' WHERE code = 'WSTG-INPV-17' AND slug = '17-Host_Header_Injection';
UPDATE cases SET slug = '17-Server-side_Template_Injection' WHERE code = 'WSTG-INPV-18' AND slug = '18-Server-side_Template_Injection';
UPDATE cases SET slug = '18-Server-Side_Request_Forgery' WHERE code = 'WSTG-INPV-19' AND slug = '19-Server-Side_Request_Forgery';
UPDATE cases SET slug = '19-Mass_Assignment' WHERE code = 'WSTG-INPV-20' AND slug = '20-Mass_Assignment';
UPDATE cases SET slug = '20-CSV_Injection' WHERE code = 'WSTG-INPV-21' AND slug = '21-CSV_Injection';
UPDATE cases SET slug = '21-Prototype_Pollution' WHERE code = 'WSTG-INPV-22' AND slug = '22-Prototype_Pollution';
UPDATE cases SET slug = '22-Insecure_Deserialization' WHERE code = 'WSTG-INPV-23' AND slug = '23-Insecure_Deserialization';

-- Eight cases the 2026 edition no longer publishes: six were dropped outright
-- (Fingerprint Web Application merged into its framework case, File Extensions,
-- RIA Cross Domain Policy, Other HTTP Security Header Misconfigurations, Weak
-- Username Policy, Cross Site Flashing) and two moved into another category
-- (Credentials Transported over an Encrypted Channel is now weak-cryptography
-- CRYP-03, HTTP Verb Tampering is now Configuration's HTTP Methods). Their rows
-- and titles stay — the checklist a client signed still lists them — but a blank
-- slug is what makes them render without a link instead of with a dead one.
UPDATE cases SET slug = '' WHERE code = 'WSTG-INFO-09' AND slug <> '';
UPDATE cases SET slug = '' WHERE code = 'WSTG-CONF-03' AND slug <> '';
UPDATE cases SET slug = '' WHERE code = 'WSTG-CONF-08' AND slug <> '';
UPDATE cases SET slug = '' WHERE code = 'WSTG-CONF-14' AND slug <> '';
UPDATE cases SET slug = '' WHERE code = 'WSTG-IDNT-05' AND slug <> '';
UPDATE cases SET slug = '' WHERE code = 'WSTG-ATHN-01' AND slug <> '';
UPDATE cases SET slug = '' WHERE code = 'WSTG-INPV-03' AND slug <> '';
UPDATE cases SET slug = '' WHERE code = 'WSTG-CLNT-08' AND slug <> '';
