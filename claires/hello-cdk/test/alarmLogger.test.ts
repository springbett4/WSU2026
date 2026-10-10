const mockDynamoSend = jest.fn().mockResolvedValue({});
 
jest.mock('@aws-sdk/client-dynamodb', () => ({
 DynamoDBClient: jest.fn(() => ({})),
}));
 
jest.mock('@aws-sdk/lib-dynamodb', () => ({
 DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockDynamoSend })) },
 PutCommand: jest.fn((input: any) => ({ input })),
}));
 
const alarmLogger = require('../lib/lambda/alarmLogger');
 
function fakeAlarmMessage(alarmName: string, site: string, metricName: string) {
 return {
   Sns: {
     Message: JSON.stringify({
       AlarmName: alarmName,
       NewStateValue: 'ALARM',
       NewStateReason: 'Threshold Crossed',
       StateChangeTime: '2026-10-10T10:00:00.000+0000',
       Trigger: {
         MetricName: metricName,
         Dimensions: [{ name: 'Target', value: site }],
       },
     }),
   },
 };
}
 
function savedItems(): any[] {
 return mockDynamoSend.mock.calls.map((call: any[]) => call[0].input);
}
 
beforeEach(() => {
 jest.clearAllMocks();
 jest.spyOn(console, 'log').mockImplementation(() => {}); });
 
describe('Functional tests - Alarm Logger Lambda', () => {
 
 test('7. Reads an SNS alarm message and saves the right fields', async () => {
   const event = { Records: [fakeAlarmMessage('LatencyAlarm', 'https://working.test', 'ResponseTime')] };
 
   const result = await alarmLogger.handler(event);
 
   expect(result.statusCode).toBe(200);
   expect(savedItems()).toHaveLength(1);
 
   const saved = savedItems()[0];
   expect(saved.TableName).toBe('TestAlarmLogTable');
   expect(saved.Item).toMatchObject({
     alarmName: 'LatencyAlarm',
     newState: 'ALARM',
     reason: 'Threshold Crossed',
     metricName: 'ResponseTime',
     target: 'https://working.test',
     stateChangeTime: '2026-10-10T10:00:00.000+0000',
   });
   expect(typeof saved.Item.id).toBe('string'); // unique id was created
 });
 
 test('8. Handles more than one alarm message at once', async () => {
   const event = {
     Records: [
       fakeAlarmMessage('AvailabilityAlarm', 'https://site-one.test', 'Availability'),
       fakeAlarmMessage('LatencyAlarm', 'https://site-two.test', 'ResponseTime'),
     ],
   };
 
   await alarmLogger.handler(event);
 
   expect(savedItems()).toHaveLength(2);
   expect(savedItems()[0].Item.alarmName).toBe('AvailabilityAlarm');
   expect(savedItems()[1].Item.alarmName).toBe('LatencyAlarm');
   expect(savedItems()[0].Item.id).not.toBe(savedItems()[1].Item.id);
 });
 
});