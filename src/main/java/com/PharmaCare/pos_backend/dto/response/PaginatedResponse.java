package com.PharmaCare.pos_backend.model.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

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
}