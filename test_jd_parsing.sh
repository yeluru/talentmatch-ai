#!/bin/bash

# Test the updated job parsing with the user's example JD

JD_TEXT='Job Description:

Job Title: Senior Information Security Architect
Location: Reston, VA

Summary:
Hiring for a Senior Information Security Architect position primarily focusing on AWS. This position requires deep expertise in Information Security principles including Business Security Architecture, Threat Modelling, Data Security (data encryption, masking, tokenization, data access controls), AWS Cloud and Systems architecture.

Must Have
1 Public Cloud: AWS Experience
Deep Expertise and proven Track record in AWS Architecture and AWS Services (Compute, IAM, RDS, Resource Policies, Network, Messaging, Data Storage, CI/CD, AI/ML, ETL, Serverless, ECS/EKS). Experience with AWS security pillars, best practices and well-designed architecture. Experience in AI/ML is preferable.

2 Information Security Architecture
Key experience: Application security, Threat Modelling, API Security, DevSecOps, Pipeline security, Infrastructure security, AuthN/Z, Encryption, Key Management, Data discovery and encryption, SIEM, CSPM, CWPP, Access Controls, Container Security
• Industry security standards and frameworks (OWASP, NIST CIS, FED Ramp, ISO, SOX etc.).
• Experience designing Architectures based on Security Standards and threat model the designs to identify issues and design mitigating controls.

3. Systems Architecture
• Key experience: System Design, API Driven architecture, Open Standards, Stateless, Resiliency, High Availability, System and SaaS Integrations.

Nice to Have
AWS advanced Certification (Professional, Specialty)
Certified Information Systems Security Professional (CISSP)
Certified Cloud Security Professional (CCSP) or equivalent'

echo "Testing job parsing..."
echo "$JD_TEXT" | curl -s -X POST \
  "http://127.0.0.1:54321/functions/v1/parse-job-description" \
  -H "Authorization: Bearer $(supabase status | grep 'anon key' | awk '{print $4}')" \
  -H "Content-Type: application/json" \
  -d @- --data-urlencode "text@-" | jq '.parsed.skills'

echo -e "\n\nTesting query generation..."
curl -s -X POST \
  "http://127.0.0.1:54321/functions/v1/build-xray-from-jd" \
  -H "Authorization: Bearer $(supabase status | grep 'anon key' | awk '{print $4}')" \
  -H "Content-Type: application/json" \
  -d "{\"jd_text\": $(echo "$JD_TEXT" | jq -Rs .)}" | jq '.'
