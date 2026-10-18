import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const STACK_NAME = process.env.STACK_NAME || 'HelloCdkStack';
jest.setTimeout(120000);

const cfn = new CloudFormationClient({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

let apiUrl: string;     
let tableName: string;  

async function timed<T>(label: string, action: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await action();
  console.log(`${label}: ${Date.now() - start} ms`);
  return result;
}

beforeAll(async () => {
  const result = await cfn.send(new DescribeStacksCommand({ StackName: STACK_NAME }));
  const outputs = result.Stacks?.[0]?.Outputs ?? [];
  apiUrl = outputs.find((o) => o.OutputKey?.startsWith('SitesApiUrl'))?.OutputValue!;
  tableName = outputs.find((o) => o.OutputKey?.startsWith('TargetsTableName'))?.OutputValue!;
  if (!apiUrl || !tableName) throw new Error('Could not find SitesApiUrl / TargetsTableName outputs. Run cdk deploy first.');
});

describe('Integration test - CRUD API (real AWS)', () => {

  test('5. Full CRUD cycle through API Gateway updates DynamoDB', async () => {
    const testUrl = `https://integration-${Date.now()}.test`;
    const updatedUrl = `${testUrl}/updated`;

    const created = await timed('API POST /sites', () => fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: testUrl }),
    }));
    expect(created.status).toBe(201);
    const site: any = await created.json();

    const stored = await timed('DynamoDB direct read', () =>
      dynamo.send(new GetCommand({ TableName: tableName, Key: { id: site.id } })));
    expect(stored.Item?.url).toBe(testUrl);

    const readOne = await timed('API GET /sites/{id}', () => fetch(`${apiUrl}/${site.id}`));
    expect(readOne.status).toBe(200);
    const one: any = await readOne.json();
    expect(one.url).toBe(testUrl);

    const readAll = await timed('API GET /sites', () => fetch(apiUrl));
    expect(readAll.status).toBe(200);
    const all: any = await readAll.json();
    expect(all.map((s: any) => s.id)).toContain(site.id);

    const updated = await timed('API PUT /sites/{id}', () => fetch(`${apiUrl}/${site.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: updatedUrl }),
    }));
    expect(updated.status).toBe(200);
    const afterUpdate = await dynamo.send(new GetCommand({ TableName: tableName, Key: { id: site.id } }));
    expect(afterUpdate.Item?.url).toBe(updatedUrl);

    const deleted = await timed('API DELETE /sites/{id}', () => fetch(`${apiUrl}/${site.id}`, { method: 'DELETE' }));
    expect(deleted.status).toBe(200);
    const afterDelete = await dynamo.send(new GetCommand({ TableName: tableName, Key: { id: site.id } }));
    expect(afterDelete.Item).toBeUndefined();

    const gone = await fetch(`${apiUrl}/${site.id}`);
    expect(gone.status).toBe(404);

    const writeId = `perf-${Date.now()}`;
    await timed('DynamoDB direct write', () =>
      dynamo.send(new PutCommand({ TableName: tableName, Item: { id: writeId, url: 'https://perf.test' } })));
    await dynamo.send(new DeleteCommand({ TableName: tableName, Key: { id: writeId } }));
  });

});