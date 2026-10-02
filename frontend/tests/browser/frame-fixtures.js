// Reuse the supplied photograph ONLY in tests to exercise multiple frame configs.
// Production keeps styles without real product photos unavailable.
export async function installFrameFixtures(page) {
  await page.route('**/src/data/faceAccessories.js*', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /\bsrc: null/g,
      'src: "/assets/face-ar/sunglasses/aviator-real.png"',
    );
    await route.fulfill({ response, body, contentType: 'application/javascript' });
  });
}
