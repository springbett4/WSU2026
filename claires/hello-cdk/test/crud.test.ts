export {}; 
process.env.TARGETS_TABLE = 'TestTargetsTable';

const mockCrudSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockCrudSend })) },
  PutCommand: jest.fn((input: any) => ({ type: 'Put', input })),
  GetCommand: jest.fn((input: any) => ({ type: 'Get', input })),
  ScanCommand: jest.fn((input: any) => ({ type: 'Scan', input })),
  UpdateCommand: jest.fn((input: any) => ({ type: 'Update', input })),
  DeleteCommand: jest.fn((input: any) => ({ type: 'Delete', input })),
}));

const crud = require('../lib/lambda/crud');

function commandsSent(type: string): any[] {
  return mockCrudSend.mock.calls.map((call: any[]) => call[0]).filter((c: any) => c.type === type);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCrudSend.mockResolvedValue({ Items: [] }); 
});

describe('Functional tests - CRUD Lambda', () => {

  test('9. Adding a valid site returns 201 and saves it to DynamoDB', async () => {
    const response = await crud.handler({
      httpMethod: 'POST',
      pathParameters: null,
      body: JSON.stringify({ url: 'https://example.test' }),
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.url).toBe('https://example.test');
    expect(typeof body.id).toBe('string');

    const puts = commandsSent('Put');
    expect(puts).toHaveLength(1);
    expect(puts[0].input.TableName).toBe('TestTargetsTable');
    expect(puts[0].input.Item.url).toBe('https://example.test');
  });

  test('10. Adding an invalid URL returns 400 and saves nothing', async () => {
    const response = await crud.handler({
      httpMethod: 'POST',
      pathParameters: null,
      body: JSON.stringify({ url: 'not-a-website' }),
    });

    expect(response.statusCode).toBe(400);
    expect(commandsSent('Put')).toHaveLength(0);
  });

});