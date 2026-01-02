package com.PharmaCare.pos_backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaginatedResponse<T> {
    private List<T> data;
    private PaginationInfo pagination;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PaginationInfo {
        private int page;
        private int limit;
        private long total;
        private int pages;
        private boolean hasNext;
        private boolean hasPrev;
    }

    public static <T> PaginatedResponse<T> of(List<T> data, int page, int limit, long total) {
        int pages = (int) Math.ceil((double) total / limit);
        return PaginatedResponse.<T>builder()
                .data(data)
                .pagination(PaginationInfo.builder()
                        .page(page)
                        .limit(limit)
                        .total(total)
                        .pages(pages)
                        .hasNext(page < pages)
                        .hasPrev(page > 1)
                        .build())
                .build();
    }

    /**
     * Creates an empty paginated response
     */
    public static <T> PaginatedResponse<T> empty(int page, int limit) {
        return PaginatedResponse.<T>builder()
                .data(Collections.emptyList())
                .pagination(PaginationInfo.builder()
                        .page(page)
                        .limit(limit)
                        .total(0)
                        .pages(0)
                        .hasNext(false)
                        .hasPrev(false)
                        .build())
                .build();
    }

    /**
     * Creates an empty paginated response with default page and limit
     */
    public static <T> PaginatedResponse<T> empty() {
        return empty(1, 20);
    }
}