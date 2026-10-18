const sites = require('./sites.json');
const https = require('https');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

const cloudwatch = new CloudWatchClient({});
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Read the target list from DynamoDB (falls back to sites.json if it can't)
async function getTargets() {
  if (!process.env.TARGETS_TABLE) return sites;
  try {
    const result = await docClient.send(new ScanCommand({ TableName: process.env.TARGETS_TABLE }));
    return (result.Items || []).map((item) => item.url);
  } catch (err) {
    console.error('Could not read target list, using sites.json:', err.message);
    return sites;
  }
}

function checkSite(url) {
  const startTime = Date.now();

  return new Promise((resolve) => {
    https.get(url, (res) => {
      const responseTimeMs = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Drain the response so Node can close the connection cleanly
      res.on('data', () => {});
      res.on('end', async () => {
        const availability = statusCode < 400 ? 1 : 0;
        try {
          await cloudwatch.send(new PutMetricDataCommand({
            Namespace: 'WebsiteMonitoring',
            MetricData: [
              {
                MetricName: 'ResponseTime',
                Value: responseTimeMs,
                Unit: 'Milliseconds',
                Dimensions: [{ Name: 'Target', Value: url }],
              },
              {
                MetricName: 'StatusCode',
                Value: statusCode,
                Unit: 'None',
                Dimensions: [{ Name: 'Target', Value: url }],
              },
              {
                MetricName: 'Availability',
                Value: availability,
                Unit: 'None',
                Dimensions: [{ Name: 'Target', Value: url }],
              },

            ],
          }));

          resolve({
            statusCode: 200,
            body: JSON.stringify({
              message: 'Metric recorded',
              target: url,
              responseTimeMs,
              targetStatusCode: statusCode,
            }),
          });
        } catch (err) {
          resolve({
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to send metric', error: err.message }),
          });
        }
      });
    }).on('error', async (err) => {
      try {
        await cloudwatch.send(new PutMetricDataCommand({
          Namespace: 'WebsiteMonitoring',
          MetricData: [
            {
              MetricName: 'Availability',
              Value: 0,
              Unit: 'None',
              Dimensions: [{ Name: 'Target', Value: url }], 
            }, 
          ],
        }));
      } catch (e) {
      }
      resolve({
        statusCode: 500,
        body: JSON.stringify({ message: 'Failed to reach target', error: err.message }),
      });
    });
  });
};

exports.handler = async function (event) {
  const targetList = await getTargets();
  const results = await Promise.all(targetList.map(url => checkSite(url)));  
  return {
    statusCode: 200,
    body: JSON.stringify(results),
  };
};