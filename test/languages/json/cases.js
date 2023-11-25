import { spam } from '@bablr/boot';
import dedent from 'dedent';

export const testCases = [
  {
    matcher: spam`<Expression>`,
    sourceText: '"hello"',
    parsed: dedent`
      <String>
        <Punctuator .open balanced='"' innerSpan='String'>
          '"'
        </>
        <StringContent .content>
          'hello'
        </>
        <Punctuator .close balancer>
          '"'
        </>
      </>
    `,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: 'true',
    parsed: dedent`
      <Boolean>
        <Keyword .value>
          'true'
        </>
      </>
    `,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: '1',
    parsed: dedent`
      <Number>
        <Digit .digits>
          '1'
        </>
      </>
    `,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: 'null',
    parsed: dedent`
      <Null>
        <Keyword .value>
          'null'
        </>
      </>
    `,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: '[]',
    parsed: dedent`
      <Array>
        <Punctuator .open balanced=']'>
          '['
        </>
        <Punctuator .close balancer>
          ']'
        </>
      </>
    `,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: '[1]',
    parsed: dedent`
      <Array>
        <Punctuator .open balanced=']'>
          '['
        </>
        <Number>
          <Digit .digits>
            '1'
          </>
        </>
        <Punctuator .close balancer>
          ']'
        </>
      </>
    `,
  },
];
