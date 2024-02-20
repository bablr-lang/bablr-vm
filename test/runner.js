import { expect } from 'expect';
import { evaluateSync, Source, Context } from '@bablr/agast-vm';
import { createPassthroughStrategy } from '@bablr/generator-class-trampoline/passthrough';
import {
  buildFragmentOpenTag,
  buildNodeOpenTag,
  buildNodeCloseTag,
  buildFragmentCloseTag,
  buildReference,
  buildLiteral,
} from '@bablr/agast-helpers/builders';

const printTokens = (tokens) =>
  tokens.flatMap((token) => (token.type === 'Literal' ? [token.value] : [])).join('');

export const runTest = (testCase) => {
  const resultTokens = [
    ...evaluateSync(
      Context.create(),
      Source.from(printTokens(testCase.tokens)),
      createPassthroughStrategy(testCase.tokens),
    ),
  ];

  expect(resultTokens).toEqual(testCase.tokens);
};

runTest({
  tokens: [buildFragmentOpenTag(), buildFragmentCloseTag()],
});

// runTest({
//   tokens: [
//     buildFragmentOpenTag(),
//     buildReference('node', false),
//     buildNodeOpenTag({}, 'Node'),
//     buildLiteral('hello world'),
//     buildNodeCloseTag('Node'),
//     buildFragmentCloseTag(),
//   ],
// });

// expect(() => {
//   runTest({
//     tokens: [
//       buildFragmentOpenTag(),
//       buildNodeOpenTag({}, 'Node'),
//       buildNodeCloseTag(),
//       buildFragmentCloseTag(),
//     ],
//   });
// }).toThrow();

// // expect(() => {
// runTest({
//   tokens: [buildFragmentOpenTag({ trivia: true }), buildFragmentCloseTag()],
// });
// // }).toThrow();

// expect(() => {
//   runTest({
//     tokens: [
//       buildFragmentOpenTag(),
//       // not matching anything: should fail
//       buildFragmentOpenTag({ trivia: true }),
//       buildFragmentCloseTag(),
//       buildFragmentCloseTag(),
//     ],
//   });
// }).toThrow();

// runTest({
//   tokens: [
//     buildFragmentOpenTag(),
//     buildFragmentOpenTag({ trivia: true }),
//     buildLiteral(' '),
//     buildFragmentCloseTag(),
//     buildFragmentCloseTag(),
//   ],
// });

// runTest({
//   tokens: [
//     buildFragmentOpenTag(),
//     buildNodeOpenTag({ intrinsic: true }, 'Keyword'),
//     buildLiteral('true'),
//     buildNodeCloseTag(),
//     buildFragmentCloseTag(),
//   ],
// });

// expect(() => {
//   runTest({
//     tokens: [
//       buildFragmentOpenTag(),
//       buildNodeOpenTag({ intrinsic: true }, 'Node'),
//       buildNodeCloseTag(),
//       buildFragmentCloseTag(),
//     ],
//   });
// }).toThrow();

// expect(() => {
//   runTest({
//     tokens: [
//       buildFragmentOpenTag(),
//       buildNodeOpenTag({ intrinsic: true }, 'Node'),
//       buildLiteral('='),
//       buildLiteral('>'),
//       buildNodeCloseTag(),
//       buildFragmentCloseTag(),
//     ],
//   });
// }).toThrow();
