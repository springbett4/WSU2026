jest.mock('../lib/lambda/sites.json', () => [
    'https://www.google.com',
    'https://www.amazon.com',
    'https://www.microsoft.com',
]);

const mockSiteBehaviour: Record<string, { status?: number; error?: string }> = {
  'https://working.test': { status: 200 },
  'https://server-error.test': { status: 500 },
  'https://unreachable.test': { error: 'getaddrinfo ENOTFOUND' },
};
 
jest.mock('https', () => {
  const { EventEmitter } = require('events');
  return {
    get: jest.fn((url: string, callback: (res: any) => void) => {
      const request = new EventEmitter();
      const behaviour = mockSiteBehaviour[url];
      process.nextTick(() => {
        if (behaviour.error) {
          request.emit('error', new Error(behaviour.error)); // site can't be reached
          return;
        }
        const response: any = new EventEmitter();
        response.statusCode = behaviour.status;
        callback(response);
        response.emit('data', 'page content');
        response.emit('end');
      });
      return request;
    }),
  };
});

const mockCloudWatchSend = jest.fn().mockResolvedValue({});
 
jest.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: jest.fn(() => ({ send: mockCloudWatchSend })),
  PutMetricDataCommand: jest.fn((input: any) => ({ input })),
}));

const monitor = require('../lib/lambda/monitor');
const https = require('https');

function metricsSentFor(url: string): any[] {
  return mockCloudWatchSend.mock.calls
    .map((call: any[]) => call[0].input)
    .filter((input: any) => input.MetricData[0].Dimensions[0].Value === url)
    .flatMap((input: any) => input.MetricData);
}

function metricValue(url: string, metricName: string): any {
  const metric = metricsSentFor(url).find((m: any) => m.MetricName === metricName);
  return metric ? metric.Value : undefined;
}

function resultFor(response: any, url: string): any {
  const results = JSON.parse(response.body).map((r: any) => JSON.parse(r.body));
  return results.find((r: any) => r.target === url);
}

beforeEach(() => {
  jest.clearAllMocks();
});
 
describe('Functional tests - Monitor Lambda', () => {

      test('1. A working site gets availability 1', async () => {
    await monitor.handler({});
    expect(metricValue('https://working.test', 'Availability')).toBe(1);
  });

  test('2. A broken or unreachable site gets availability 0', async () => {
   await monitor.handler({});
   expect(metricValue('https://server-error.test', 'Availability')).toBe(0);
   expect(metricValue('https://unreachable.test', 'Availability')).toBe(0);
 });
 
 test('3. Latency is measured as a number', async () => {
   await monitor.handler({});
   const latency = metricValue('https://working.test', 'ResponseTime');
   expect(typeof latency).toBe('number');
   expect(latency).toBeGreaterThanOrEqual(0);
 });
 
 test('4. The status code is returned', async () => {
   const response = await monitor.handler({});
   expect(resultFor(response, 'https://working.test').targetStatusCode).toBe(200);
   expect(metricValue('https://server-error.test', 'StatusCode')).toBe(500);
 });
 
 test('5. Every site in sites.json gets checked', async () => {
   const response = await monitor.handler({});
   expect(https.get).toHaveBeenCalledTimes(3);
   expect(JSON.parse(response.body)).toHaveLength(3);
 });
 
 test('6. Three metrics are sent to CloudWatch per site', async () => {
   await monitor.handler({});
   const names = metricsSentFor('https://working.test').map((m: any) => m.MetricName);
   expect(names).toEqual(expect.arrayContaining(['ResponseTime', 'StatusCode', 'Availability']));
   expect(names).toHaveLength(3);
 
   const namespaces = mockCloudWatchSend.mock.calls.map((call: any[]) => call[0].input.Namespace);
   namespaces.forEach((ns: string) => expect(ns).toBe('WebsiteMonitoring'));
 });
 
});

