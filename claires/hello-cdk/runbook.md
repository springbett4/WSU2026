# Runbook — Website Monitoring Alarms

## Availability alarm fires
1. Check CloudWatch → Alarms → confirm which site
2. Manually curl the site URL to confirm it's actually down
3. If down: check the site's own status page / contact the site owner
4. If up (false alarm): check Lambda logs for a transient error

## Latency alarm fires
1. Check CloudWatch → Alarms → confirm which site
2. Check ResponseTime metric graph for a trend vs a spike
3. If ongoing: may indicate the target site is under load, not our system
4. Note in team channel / issue tracker for follow-up

## General checks
- Lambda logs: CloudWatch → Log groups → `/aws/lambda/HelloCdkStack-...`
- To redeploy: `cdk deploy`
- To tear down: `cdk destroy`
