import { spam } from '@bablr/boot';
import { dedent } from '@qnighy/dedent';

export const testCases = [
  {
    matcher: spam`<Expression>`,
    sourceText: '"hello"',
    parsed: dedent`\
      <String>
        open:
        <Punctuator balanced='"' innerSpan='String'>
          '"'
        </>
        content:
        <StringContent>
          'hello'
        </>
        close:
        <Punctuator balancer>
          '"'
        </>
      </>`,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: '""',
    parsed: dedent`\
      <String>
        open:
        <Punctuator balanced='"' innerSpan='String'>
          '"'
        </>
        content:
        null
        close:
        <Punctuator balancer>
          '"'
        </>
      </>`,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: '"\\n"',
    parsed: dedent`\
      <String>
        open:
        <Punctuator balanced='"' innerSpan='String'>
          '"'
        </>
        content:
        <StringContent>
          !'${'\\\\n'}' :'${'\\n'}'
        </>
        close:
        <Punctuator balancer>
          '"'
        </>
      </>`,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: 'true',
    parsed: dedent`\
      <Boolean>
        value:
        <Keyword>
          'true'
        </>
      </>`,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: '1',
    parsed: dedent`\
      <Number>
        digits[]:
        <Digit>
          '1'
        </>
      </>`,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: 'null',
    parsed: dedent`\
      <Null>
        value:
        <Keyword>
          'null'
        </>
      </>`,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: '[]',
    parsed: dedent`\
      <Array>
        open:
        <Punctuator balanced=']'>
          '['
        </>
        close:
        <Punctuator balancer>
          ']'
        </>
      </>`,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: '[1]',
    parsed: dedent`\
      <Array>
        open:
        <Punctuator balanced=']'>
          '['
        </>
        elements[]:
        <Number>
          digits[]:
          <Digit>
            '1'
          </>
        </>
        close:
        <Punctuator balancer>
          ']'
        </>
      </>`,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: '[1,2]',
    parsed: dedent`\
      <Array>
        open:
        <Punctuator balanced=']'>
          '['
        </>
        elements[]:
        <Number>
          digits[]:
          <Digit>
            '1'
          </>
        </>
        separators[]:
        <Punctuator>
          ','
        </>
        elements[]:
        <Number>
          digits[]:
          <Digit>
            '2'
          </>
        </>
        close:
        <Punctuator balancer>
          ']'
        </>
      </>`,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: '{"foo":null}',
    parsed: dedent`\
      <Object>
        open:
        <Punctuator balanced='}'>
          '{'
        </>
        properties[]:
        <Property>
          key:
          <String>
            open:
            <Punctuator balanced='"' innerSpan='String'>
              '"'
            </>
            content:
            <StringContent>
              'foo'
            </>
            close:
            <Punctuator balancer>
              '"'
            </>
          </>
          mapOperator:
          <Punctuator>
            ':'
          </>
          value:
          <Null>
            value:
            <Keyword>
              'null'
            </>
          </>
        </>
        close:
        <Punctuator balancer>
          '}'
        </>
      </>`,
  },
];
