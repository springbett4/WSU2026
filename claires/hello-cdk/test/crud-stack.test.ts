import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as HelloCdk from '../lib/hello-cdk-stack';

let template: Template;

beforeAll(() => {
  const app = new cdk.App();
  const stack = new HelloCdk.HelloCdkStack(app, 'CrudTestStack');
  template = Template.fromStack(stack);
});

describe('Unit tests - CRUD API', () => {

  test('11. CRUD Lambda exists and is given the target table name', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'crud.handler',
      Environment: { Variables: { TARGETS_TABLE: Match.anyValue() } },
    });
  });

  test('12. API Gateway has GET, POST, PUT and DELETE methods', () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      template.hasResourceProperties('AWS::ApiGateway::Method', { HttpMethod: method });
    }
    template.resourceCountIs('AWS::ApiGateway::Method', 5); 
  });

});