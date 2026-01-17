const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    try {
        const { email } = JSON.parse(event.body);

        if (!email) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Email is required' })
            };
        }

        console.log(`Verifying license for: ${email}`);

        // 1. Search for customer by email
        const customers = await stripe.customers.list({
            email: email,
            limit: 10
        });

        if (customers.data.length === 0) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ valid: false, message: 'No customer found with this email.' })
            };
        }

        // 2. Check for payments - Logic: Has the customer successfully paid?
        // Since this is a one-time payment for "Lifetime Access", we check PaymentIntents or Charges.
        // For subscriptions, we would check stripe.subscriptions.list({ customer: ... })

        let hasValidLicense = false;

        // Check all found customers (in case of duplicates)
        for (const customer of customers.data) {
            // Check for successful charges associated with this customer
            const charges = await stripe.charges.list({
                customer: customer.id,
                limit: 100
            });

            // Filter for succeeded chargest
            const successfulCharge = charges.data.some(c => c.status === 'succeeded' && c.refunded === false);

            if (successfulCharge) {
                hasValidLicense = true;
                break; // Found one, we are good
            }
        }

        if (hasValidLicense) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ valid: true })
            };
        } else {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ valid: false, message: 'No valid payment found for this email.' })
            };
        }

    } catch (error) {
        console.error('Stripe Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Server error verifying license.' })
        };
    }
};
