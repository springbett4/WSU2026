const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function isValidUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function readUrlFromBody(event) {
  const body = JSON.parse(event.body || '{}');
  return body.url;
}

exports.handler = async (event) => {
  const table = process.env.TARGETS_TABLE;
  const method = event.httpMethod;
  const id = event.pathParameters && event.pathParameters.id;

  try {
    if (method === 'POST' && !id) {
      const url = readUrlFromBody(event);
      if (!isValidUrl(url)) return respond(400, { message: 'Body must include a valid "url" starting with http:// or https://' });

      const existing = await docClient.send(new ScanCommand({
        TableName: table,
        FilterExpression: '#u = :u',
        ExpressionAttributeNames: { '#u': 'url' },
        ExpressionAttributeValues: { ':u': url },
      }));
      if (existing.Items && existing.Items.length > 0) {
        return respond(409, { message: 'This site is already being monitored', site: existing.Items[0] });
      }

      const item = { id: randomUUID(), url, createdAt: new Date().toISOString() };
      await docClient.send(new PutCommand({ TableName: table, Item: item }));
      return respond(201, item);
    }

    if (method === 'GET' && !id) {
      const result = await docClient.send(new ScanCommand({ TableName: table }));
      return respond(200, result.Items || []);
    }

    if (method === 'GET' && id) {
      const result = await docClient.send(new GetCommand({ TableName: table, Key: { id } }));
      if (!result.Item) return respond(404, { message: `Site ${id} not found` });
      return respond(200, result.Item);
    }

    if (method === 'PUT' && id) {
      const url = readUrlFromBody(event);
      if (!isValidUrl(url)) return respond(400, { message: 'Body must include a valid "url" starting with http:// or https://' });

      const result = await docClient.send(new UpdateCommand({
        TableName: table,
        Key: { id },
        UpdateExpression: 'SET #u = :u, updatedAt = :t',
        ConditionExpression: 'attribute_exists(id)',   
        ExpressionAttributeNames: { '#u': 'url' },
        ExpressionAttributeValues: { ':u': url, ':t': new Date().toISOString() },
        ReturnValues: 'ALL_NEW',
      }));
      return respond(200, result.Attributes);
    }

    if (method === 'DELETE' && id) {
      await docClient.send(new DeleteCommand({
        TableName: table,
        Key: { id },
        ConditionExpression: 'attribute_exists(id)',   
      }));
      return respond(200, { message: `Site ${id} deleted`, id });
    }

    return respond(405, { message: `Method ${method} not allowed on this path` });
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return respond(404, { message: `Site ${id} not found` });
    if (err instanceof SyntaxError) return respond(400, { message: 'Request body must be valid JSON' });
    console.error(err);
    return respond(500, { message: 'Something went wrong', error: err.message });
  }
};