async function test() {
    try {
        const url = encodeURIComponent('https://www.amazon.com/dp/B07FZ8S74R');
        const res = await fetch(`https://api.allorigins.win/get?url=${url}`);
        const data = await res.json();
        console.log('Status:', res.status);
        console.log('Contents length:', data.contents?.length);
        if (data.contents) {
            const html = data.contents;
            console.log('Title match?', html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
        }
    } catch (e) {
        console.error(e);
    }
}
test();
