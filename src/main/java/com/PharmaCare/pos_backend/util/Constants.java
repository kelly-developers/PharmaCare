package com.PharmaCare.pos_backend.util;

public class Constants {

    private Constants() {
        // Utility class, no instantiation
    }

    // API Constants
//    public static final String API_VERSION = "v1";
    public static final String API_BASE_PATH = "/api/";

    // Security Constants
    public static final long JWT_EXPIRATION = 86400000; // 24 hours in milliseconds
    public static final long REFRESH_TOKEN_EXPIRATION = 604800000; // 7 days in milliseconds

    // Stock Constants
    public static final int LOW_STOCK_THRESHOLD_PERCENTAGE = 20;
    public static final int EXPIRY_WARNING_DAYS = 90;
    public static final int DEFAULT_REORDER_QUANTITY = 100;

    // File Upload Constants
    public static final long MAX_FILE_SIZE_MB = 10;
    public static final String[] ALLOWED_IMAGE_TYPES = {
            "image/jpeg", "image/png", "image/gif"
    };

    // Report Constants
    public static final String REPORT_DATE_FORMAT = "yyyy-MM-dd";
    public static final String REPORT_DATETIME_FORMAT = "yyyy-MM-dd HH:mm:ss";

    // Pagination Constants
    public static final int DEFAULT_PAGE_SIZE = 20;
    public static final int MAX_PAGE_SIZE = 100;

    // Currency Constants
    public static final String CURRENCY_SYMBOL = "KES";
    public static final String CURRENCY_CODE = "KES";

    // Validation Constants
    public static final int MIN_PASSWORD_LENGTH = 6;
    public static final int MAX_NAME_LENGTH = 100;
    public static final int MAX_EMAIL_LENGTH = 255;
    public static final int MAX_PHONE_LENGTH = 20;

    // Business Constants
    public static final double DEFAULT_TAX_RATE = 0.16; // 16% VAT in Kenya
    public static final double DEFAULT_PROFIT_MARGIN = 0.3; // 30% profit margin

    // Date Constants
    public static final String[] MONTH_NAMES = {
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
    };

    // Error Messages
    public static final String ERROR_INVALID_CREDENTIALS = "Invalid email or password";
    public static final String ERROR_UNAUTHORIZED = "Unauthorized access";
    public static final String ERROR_FORBIDDEN = "Access forbidden";
    public static final String ERROR_RESOURCE_NOT_FOUND = "Resource not found";
    public static final String ERROR_VALIDATION_FAILED = "Validation failed";
    public static final String ERROR_INSUFFICIENT_STOCK = "Insufficient stock";
    public static final String ERROR_DUPLICATE_ENTRY = "Duplicate entry found";

    // Success Messages
    public static final String SUCCESS_CREATED = "Created successfully";
    public static final String SUCCESS_UPDATED = "Updated successfully";
    public static final String SUCCESS_DELETED = "Deleted successfully";
    public static final String SUCCESS_RETRIEVED = "Retrieved successfully";
    public static final String SUCCESS_LOGIN = "Login successful";
    public static final String SUCCESS_LOGOUT = "Logout successful";
}