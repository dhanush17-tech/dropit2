# Shopwise API Documentation

## Overview
Shopwise API provides a comprehensive solution for retrieving shopping-related data such as product details, price comparisons, latest deals, and coupon information. Our API is designed to help developers integrate various shopping features into their applications.

## Features
- **Search Item**: Search for products using Google Shopping based on item name and region.
- **Product Details**: Retrieve detailed information about products, including descriptions and ratings.
- **Latest Deals**: Get the latest deals for specific items in a given region.
- **Latest Coupons**: Access the latest available coupons.
- **Barcode Scan**: Retrieve product information using a UPC code and region.

## Endpoints

### 1. Search Item
- **Endpoint**: `/searchItem`
- **Method**: `GET`
- **Parameters**:
  - `itemName`: Name of the item (required).
  - `region`: The search region (required).

### 2. Product Details
- **Endpoint**: `/productDetails`
- **Method**: `GET`
- **Parameters**:
  - `title`: Title of the product (required).

### 3. Latest Deals
- **Endpoint**: `/latestDeals`
- **Method**: `GET`
- **Parameters**:
  - `itemName`: Name of the item (required).
  - `region`: The search region (required).
  - `page`: Page number for pagination (optional).
  - `limit`: Number of deals per page (optional).

### 4. Latest Coupons
- **Endpoint**: `/latestCoupons`
- **Method**: `GET`

### 5. Barcode Scan
- **Endpoint**: `/barcodeScan`
- **Method**: `GET`
- **Parameters**:
  - `upcCode`: The UPC code of the product (required).
  - `region`: The search region (required).

## Error Handling
All API requests will respond with appropriate HTTP status codes. In case of an error, the response will include a 500 status code

## Rate Limiting
3 request/second.

## Support
For support, please contact [support](mailto:dhanush.kalaiselvan@gmail.com).
